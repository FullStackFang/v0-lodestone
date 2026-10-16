/** Prior art for a card: the papers whose abstracts sit closest to any of
 *  the card's blocks. Works with no other member in the cohort — the corpus
 *  comes to the card.
 *
 *  Abstracts are embedded whole into `document_chunk`, the column the
 *  schema reserved and nothing had written. No model reads the paper: the
 *  match is cosine between the card's block vectors and the abstract, and
 *  the explanation is which block came closest. */
import { and, count, countDistinct, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { EMBEDDING_DIMENSIONS, artifactTexts, document, documentChunk } from "@/db/schema";
import type { Embedder } from "./cards";
import { blockLabel } from "./cards";
import { forgeCard } from "@/db/lodestone-schema";
import { parseForgeIdea } from "@/harness/founder/forge";
import { cosine, ideaVectors, type IdeaVector } from "./vectors";
import { citationLine } from "@/harness/papers/openalex";

/** The document sources that rank as prior art: a patent is a paper for
 *  everything Lodestone does with one. */
export const CORPUS_SOURCES = ["paper", "patent"] as const;
export type CorpusKind = (typeof CORPUS_SOURCES)[number];

/** One provider request's worth. */
const EMBED_BATCH = 128;

/** Embed every paper and patent whose abstract has no chunk yet. Returns how
 *  many. Written a batch at a time, so a run killed partway keeps what it
 *  embedded and leaves the rest for the next call. The abstract is read from
 *  its newest canonical text, its one stored copy; a document without one has
 *  nothing to embed and is left for `corpusOrphans` to report. */
export async function embedPaperAbstracts(db: Db, embed: Embedder, batch = EMBED_BATCH): Promise<number> {
  const rows = await db
    .select({ id: document.id, text: artifactTexts.canonicalText })
    .from(document)
    .innerJoin(artifactTexts, eq(artifactTexts.artifactId, document.id))
    .leftJoin(documentChunk, eq(documentChunk.documentId, document.id))
    .where(and(inArray(document.source, [...CORPUS_SOURCES]), isNull(documentChunk.id)))
    .orderBy(document.id, desc(artifactTexts.version));
  const seen = new Set<string>();
  const missing = rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  let written = 0;
  for (let from = 0; from < missing.length; from += batch) {
    const slice = missing.slice(from, from + batch);
    const result = await embed(slice.map((m) => m.text), "document");
    if (!result.embedded) return written;
    for (const [at, m] of slice.entries()) {
      const vector = result.vectors[at];
      if (!vector) continue;
      await db.insert(documentChunk).values({ documentId: m.id, ordinal: 0, text: null, embedding: vector });
      written += 1;
    }
  }
  return written;
}

export interface PaperHit {
  documentId: string;
  /** `document.source`: a paper or a patent, ranked in one list. */
  kind: CorpusKind;
  /** The ingest set the document came from, or null for a seeded one. */
  querySet: string | null;
  title: string;
  score: number;
  /** The block that came closest, then any other within a hair of it. */
  blocks: string[];
  /** The same blocks by key (`value_proposition`), in the same order. */
  blockKeys: string[];
  year: number | null;
  venue: string | null;
  field: string | null;
  url: string | null;
  /** True when the author listed this paper in the card's `already_have` —
   *  the one the idea started from. Still returned, so they see the corpus
   *  holds it, but flagged: it is theirs, not a find. */
  yours: boolean;
  addedAt: Date;
}

/** A DOI as a key: lower-cased, with any resolver prefix dropped. */
function doiKey(doi: string): string {
  return doi.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "").replace(/^doi:/, "");
}

/** An OpenAlex id as a key: lower-cased, with the site's prefix dropped. */
function idKey(id: string): string {
  return id.trim().toLowerCase().replace(/^https?:\/\/openalex\.org\//, "");
}

/** The papers a card's author holds, as every key a corpus row could carry.
 *  Empty for a document before `/3`. */
export function heldPapers(doc: Record<string, unknown>): Set<string> {
  const keys = new Set<string>();
  for (const a of parseForgeIdea(doc).alreadyHave) {
    keys.add(idKey(a.id));
    if (a.doi) keys.add(doiKey(a.doi));
  }
  return keys;
}

function isHeld(held: Set<string>, provenance: Record<string, unknown>): boolean {
  if (held.size === 0) return false;
  const { doi, openalex_id: id } = provenance;
  return (typeof doi === "string" && held.has(doiKey(doi))) || (typeof id === "string" && held.has(idKey(id)));
}

/** What a hit says about its document, beside the score. */
interface PaperMeta {
  documentId: string;
  kind: CorpusKind;
  title: string | null;
  provenance: Record<string, unknown> | null;
  addedAt: Date;
}

export interface PaperRow extends PaperMeta {
  embedding: number[];
}

/** Score one paper against a card's rows in Node. Ranking no longer does
 *  this — `priorArtFor` scores in the database — but it is the definition
 *  the database path is tested against. */
export function scorePaper(rows: IdeaVector[], paper: PaperRow, held: Set<string> = new Set()): PaperHit {
  const byBlock = new Map<string, number>();
  for (const r of rows) {
    const c = cosine(r.embedding, paper.embedding);
    byBlock.set(r.block, Math.max(byBlock.get(r.block) ?? -Infinity, c));
  }
  return hitFrom(paper, byBlock, held);
}

/** A hit from each block's best cosine: the score is the best block, and the
 *  explanation is that block and any other within a hair of it. */
function hitFrom(paper: PaperMeta, byBlock: Map<string, number>, held: Set<string>): PaperHit {
  const best = Math.max(...byBlock.values());
  const blockKeys = [...byBlock.entries()]
    .filter(([, c]) => c >= best - 0.03)
    .sort((a, b) => b[1] - a[1])
    .map(([b]) => b);
  const blocks = blockKeys.map(blockLabel);
  const p = paper.provenance ?? {};
  return {
    documentId: paper.documentId,
    kind: paper.kind,
    querySet: typeof p.query_set === "string" ? p.query_set : null,
    title: paper.title ?? (paper.kind === "patent" ? "Untitled patent" : "Untitled paper"),
    score: best,
    blocks,
    blockKeys,
    year: typeof p.year === "number" ? p.year : null,
    venue: typeof p.venue === "string" ? p.venue : null,
    field: typeof p.field === "string" ? p.field : null,
    url: typeof p.url === "string" ? p.url : typeof p.doi === "string" ? `https://doi.org/${p.doi}` : null,
    yours: isHeld(held, p),
    addedAt: paper.addedAt,
  };
}

const corpusSources = sql.join(CORPUS_SOURCES.map((s) => sql`${s}`), sql`, `);

/** The `query_set` of a document a card search brought in. */
export const CARD_SEARCH_QUERY_SET = "card-search";

/** How many hits one field may hold in a ranked list. */
export const PER_FIELD = 3;
/** Candidates ranked per hit returned, so the quota has others to reach for. */
const CANDIDATE_DEPTH = 3;

/** Walk the hits in order, taking one while its field holds fewer than
 *  `perField`, until `k` are taken. A missing field is a bucket of its own. A
 *  short list means the candidates ran out, not that the quota bent. */
export function fieldQuota<T extends { field: string | null }>(hits: T[], k: number, perField = PER_FIELD): T[] {
  const taken = new Map<string | null, number>();
  const out: T[] = [];
  for (const h of hits) {
    if (out.length >= k) break;
    const n = taken.get(h.field) ?? 0;
    if (n >= perField) continue;
    taken.set(h.field, n + 1);
    out.push(h);
  }
  return out;
}

/** The k closest papers to this card, or an empty list when the card has no
 *  vectors yet. `since` narrows to papers added after a date, for the digest.
 *  A paper the author listed as already held is ranked like any other and
 *  flagged `yours`.
 *
 *  Ranked in the database; only the k hits' per-block cosines come back.
 *  Candidates are the union of each card row's k nearest chunks by the HNSW
 *  index. The union is exact: a paper in the true top k is in its own best
 *  row's top k, since anything nearer that row also scores above it. The
 *  candidates are then scored exactly, the corpus side cast up from half
 *  precision. `since` skips the index and scores every document added since,
 *  a week of ingest, which a filtered index scan could under-return. It
 *  leaves out documents a card search brought in: one member's private card
 *  must not surface its topic in everyone's digest.
 *
 *  The database ranks `3k` and `fieldQuota` keeps at most `perField` per
 *  field among the `k` returned. A document outside the dominant fields
 *  appears only if fewer than `3k` outrank it; `perField: Infinity` turns
 *  the quota off, for the eval. */
export async function priorArtFor(db: Db, ideaId: string, k = 5, since?: Date, options: { perField?: number } = {}): Promise<PaperHit[]> {
  const perField = options.perField ?? PER_FIELD;
  const depth = Number.isFinite(perField) ? k * CANDIDATE_DEPTH : k;
  const rows = (await ideaVectors(db, [ideaId])).get(ideaId) ?? [];
  if (rows.length === 0) return [];
  const [card] = await db.select({ doc: forgeCard.doc }).from(forgeCard).where(eq(forgeCard.ideaId, ideaId)).limit(1);
  const held = card ? heldPapers(card.doc) : new Set<string>();

  const q = sql.join(
    rows.map((r) => sql`(${r.block}, ${JSON.stringify(r.embedding)}::vector(${sql.raw(String(EMBEDDING_DIMENSIONS))}))`),
    sql`, `,
  );
  const candidates = since
    ? sql`select d.id as document_id from document d
          where d.source in (${corpusSources}) and d.created_at >= ${since.toISOString()}
            and not exists (select 1 from artifact_texts a
                            where a.artifact_id = d.id and a.provenance->>'query_set' = ${CARD_SEARCH_QUERY_SET})`
    : sql`select distinct n.document_id from q cross join lateral (
            select c.document_id from document_chunk c join document d on d.id = c.document_id
            where d.source in (${corpusSources}) and c.embedding is not null
            order by c.embedding <=> q.v::halfvec(${sql.raw(String(EMBEDDING_DIMENSIONS))})
            limit ${depth}
          ) n`;
  const result = await db.execute(sql`
    with q(block, v) as (values ${q}),
    candidates as (${candidates}),
    per_block as (
      select c.document_id, q.block, max(1 - (c.embedding::vector <=> q.v)) as cos
      from candidates join document_chunk c on c.document_id = candidates.document_id cross join q
      where c.embedding is not null
      group by c.document_id, q.block
    ),
    best as (
      select p.document_id from per_block p join document d on d.id = p.document_id
      group by p.document_id, d.created_at
      order by max(p.cos) desc, d.created_at desc
      limit ${depth}
    )
    select p.document_id, p.block, p.cos from per_block p join best using (document_id)`);
  const scored = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as { document_id: string; block: string; cos: number | string }[];
  if (scored.length === 0) return [];

  // Each map is seeded in the card's row order, as `scorePaper` fills it, so
  // blocks that tie are named in the same order.
  const byDocument = new Map<string, Map<string, number>>();
  for (const s of scored) {
    const blocks = byDocument.get(s.document_id) ?? new Map(rows.map((r) => [r.block, -Infinity]));
    blocks.set(s.block, Number(s.cos));
    byDocument.set(s.document_id, blocks);
  }
  const meta = await db
    .select({ documentId: document.id, kind: document.source, title: document.title, provenance: artifactTexts.provenance, addedAt: document.createdAt })
    .from(document)
    .leftJoin(artifactTexts, eq(artifactTexts.artifactId, document.id))
    .where(inArray(document.id, [...byDocument.keys()]))
    .orderBy(desc(document.createdAt), desc(artifactTexts.version));
  const seen = new Set<string>();
  const ranked = meta
    .filter((m) => (seen.has(m.documentId) ? false : (seen.add(m.documentId), true)))
    .map((m) => hitFrom({ ...m, kind: m.kind as CorpusKind }, byDocument.get(m.documentId)!, held))
    .sort((a, b) => b.score - a.score);
  return fieldQuota(ranked, k, perField);
}

/** How many papers the corpus holds with a vector. */
export async function corpusSize(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: countDistinct(documentChunk.documentId) })
    .from(documentChunk)
    .innerJoin(document, eq(document.id, documentChunk.documentId))
    .where(and(inArray(document.source, [...CORPUS_SOURCES]), isNotNull(documentChunk.embedding)));
  return row?.n ?? 0;
}

/** Corpus documents with no canonical text: a write that broke halfway. They
 *  are never embedded or served, so the ingest and seed scripts name them. */
export async function corpusOrphans(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(document)
    .leftJoin(artifactTexts, eq(artifactTexts.artifactId, document.id))
    .where(and(inArray(document.source, [...CORPUS_SOURCES]), isNull(artifactTexts.id)));
  return row?.n ?? 0;
}

export interface CorpusDocument {
  documentId: string;
  kind: CorpusKind;
  title: string | null;
  /** The canonical abstract — the only text Lodestone holds for a work. */
  abstract: string;
  /** The stored `text_hash` of that abstract. A client keeps it beside
   *  anything anchored in the abstract; a different hash on a later read
   *  means the abstract was replaced. */
  abstractHash: string;
  provenance: Record<string, unknown>;
  citation: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One paper or patent as the read endpoint serves it, or null for any id
 *  that is not one — a card's idea id included, and a corpus row whose
 *  canonical text never landed. */
export async function corpusDocument(db: Db, documentId: string): Promise<CorpusDocument | null> {
  if (!UUID.test(documentId)) return null;
  const [row] = await db
    .select({ kind: document.source, title: document.title, abstract: artifactTexts.canonicalText, abstractHash: artifactTexts.textHash, provenance: artifactTexts.provenance })
    .from(document)
    .innerJoin(artifactTexts, eq(artifactTexts.artifactId, document.id))
    .where(and(eq(document.id, documentId), inArray(document.source, [...CORPUS_SOURCES])))
    .orderBy(desc(artifactTexts.version))
    .limit(1);
  if (!row) return null;
  const kind = row.kind as CorpusKind;
  const provenance = row.provenance ?? {};
  return { documentId, kind, title: row.title, abstract: row.abstract, abstractHash: row.abstractHash, provenance, citation: citationFor(kind, provenance, row.title) };
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.length > 0) : []);

/** The citation line from stored provenance alone: authors (a patent's
 *  inventors), year, title, then the venue or the patent number. */
export function citationFor(kind: CorpusKind, p: Record<string, unknown>, title: string | null): string {
  const patent = kind === "patent";
  const number = typeof p.patent_number === "string" ? p.patent_number : null;
  return citationLine(
    {
      doi: typeof p.doi === "string" ? p.doi : null,
      openalex_id: typeof p.openalex_id === "string" ? p.openalex_id : null,
      field: typeof p.field === "string" ? p.field : null,
      venue: patent ? (number ? `US Patent ${number}` : null) : typeof p.venue === "string" ? p.venue : null,
      year: typeof p.year === "number" ? p.year : null,
      authors: strings(patent ? p.inventors : p.authors),
      url: typeof p.url === "string" ? p.url : null,
    },
    title,
  );
}
