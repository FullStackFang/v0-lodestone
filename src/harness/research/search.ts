/** A research question against the stored papers: the question embedded in
 *  Voyage's query role, cosine kNN over `document_chunk`, and each hit with
 *  what a review needs to cite it.
 *
 *  With a set, the HNSW scan cannot filter on provenance, so it oversamples
 *  — `k * 20` nearest, filtered, then `k * 100` once if fewer than `k`
 *  survive — with `hnsw.ef_search` raised to match, since an index scan
 *  returns no more rows than that (default 40) whatever the limit says.
 *
 *  A metric the paper does not have is null, never 0: unknown is not zero. */
import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { EMBEDDING_DIMENSIONS } from "@/db/schema";
import { CORPUS_SOURCES } from "@/lodestone/priorArt";
import type { Embedder } from "@/lodestone/cards";
import { rebuildAbstract, titleOf } from "@/harness/papers/openalex";
import { searchWorks, type SearchOptions } from "@/harness/papers/search";

/** pgvector's ceiling on `hnsw.ef_search`. */
const MAX_EF_SEARCH = 1000;

export interface PaperSearchHit {
  /** The stored document id, or for a live OpenAlex hit its W-id. */
  id: string;
  source: "corpus" | "openalex";
  title: string | null;
  year: number | null;
  query_set: string | null;
  rating_avg: number | null;
  citations_per_year: number | null;
  /** OpenReview, else the site, else the DOI. */
  link: string | null;
  /** Cosine to the question; null for an OpenAlex hit, which was not embedded. */
  similarity: number | null;
  abstract: string;
}

export interface SearchRow {
  document_id: string;
  title: string | null;
  similarity: number | string;
  canonical_text: string;
  provenance: Record<string, unknown>;
}

const numberOr = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const textOr = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);

export function linkOf(provenance: Record<string, unknown>): string | null {
  const doi = textOr(provenance.doi);
  return textOr(provenance.openreview) ?? textOr(provenance.site) ?? (doi ? `https://doi.org/${doi}` : null);
}

export function hitOf(row: SearchRow): PaperSearchHit {
  const p = row.provenance ?? {};
  return {
    id: row.document_id,
    source: "corpus",
    title: row.title,
    year: numberOr(p.year),
    query_set: textOr(p.query_set),
    rating_avg: numberOr(p.rating_avg),
    citations_per_year: numberOr(p.citations_per_year),
    link: linkOf(p),
    similarity: Number(row.similarity),
    abstract: row.canonical_text,
  };
}

async function nearest(db: Db, vector: number[], reach: number, k: number, set: string | null): Promise<SearchRow[]> {
  const dims = sql.raw(String(EMBEDDING_DIMENSIONS));
  const sources = sql.join(CORPUS_SOURCES.map((s) => sql`${s}`), sql`, `);
  const q = sql`${JSON.stringify(vector)}::halfvec(${dims})`;
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`set local hnsw.ef_search = ${Math.min(Math.max(reach, 40), MAX_EF_SEARCH)}`));
    const result = await tx.execute(sql`
      with near as (
        select c.document_id, 1 - (c.embedding <=> ${q}) as similarity
        from document_chunk c join document d on d.id = c.document_id
        where d.source in (${sources}) and c.embedding is not null
        order by c.embedding <=> ${q}
        limit ${reach}
      )
      select n.document_id, d.title, n.similarity, a.canonical_text, a.provenance
      from near n
      join document d on d.id = n.document_id
      join lateral (
        select canonical_text, provenance from artifact_texts
        where artifact_id = n.document_id order by version desc limit 1
      ) a on true
      where ${set === null ? sql`true` : sql`a.provenance->>'query_set' = ${set}`}
      order by n.similarity desc, n.document_id
      limit ${k}`);
    return (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as SearchRow[];
  });
}

/** The `k` stored papers nearest the question, nearest first. Throws when
 *  the embedder could not embed it — without `VOYAGE_API_KEY` there is no
 *  query vector and so no honest answer. */
export async function searchPapers(
  db: Db,
  embedder: Embedder,
  { q, k, set = null }: { q: string; k: number; set?: string | null },
): Promise<PaperSearchHit[]> {
  const embedded = await embedder([q], "query");
  const vector = embedded.vectors[0];
  if (!embedded.embedded || !vector) throw new Error("VOYAGE_API_KEY is not set: the question cannot be embedded, so nothing can be searched.");
  let rows = await nearest(db, vector, set === null ? k : k * 20, k, set);
  if (set !== null && rows.length < k) rows = await nearest(db, vector, k * 100, k, set);
  return rows.map(hitOf);
}

/** Up to `k` live OpenAlex works for the same question, by semantic search.
 *  Nothing is written: a hit is its W-id and what OpenAlex said, and only a
 *  work a review goes on to cite is ingested, by `research-links`. */
export async function openalexHits(
  q: string,
  k: number,
  options: Pick<SearchOptions, "fetchImpl" | "wait" | "onNotice"> = {},
): Promise<{ hits: PaperSearchHit[]; stopped: string | null }> {
  const hits: PaperSearchHit[] = [];
  const result = await searchWorks({ query: q, semantic: true, scholarly: true, limit: k, ...options }, async (work) => {
    const w = /W\d+$/i.exec(work.id ?? "")?.[0];
    if (!w) return;
    hits.push({
      id: w.toUpperCase(),
      source: "openalex",
      title: titleOf(work),
      year: work.publication_year ?? null,
      query_set: null,
      rating_avg: null,
      citations_per_year: null,
      link: work.doi ?? work.id ?? null,
      similarity: null,
      abstract: rebuildAbstract(work.abstract_inverted_index) ?? "",
    });
  });
  return { hits, stopped: result.stopped ? result.reason ?? "stopped" : null };
}

/** Several searches as one list: a question has more than one sub-claim, and
 *  no single query reaches all of them. Each id once, at its best similarity;
 *  stored hits nearest first, then live OpenAlex hits in the order found. */
export function mergeHits(lists: PaperSearchHit[][]): PaperSearchHit[] {
  const byId = new Map<string, PaperSearchHit>();
  for (const hit of lists.flat()) {
    const held = byId.get(hit.id);
    if (!held || (hit.similarity ?? -Infinity) > (held.similarity ?? -Infinity)) byId.set(hit.id, hit);
  }
  const all = [...byId.values()];
  const stored = all.filter((h) => h.source === "corpus").sort((a, b) => b.similarity! - a.similarity!);
  return [...stored, ...all.filter((h) => h.source === "openalex")];
}
