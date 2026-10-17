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
  const blocks = [...byBlock.entries()]
    .filter(([, c]) => c >= best - 0.03)
    .sort((a, b) => b[1] - a[1])
    .map(([b]) => blockLabel(b));
  const p = paper.provenance ?? {};
  return {
    documentId: paper.documentId,
    kind: paper.kind,
    querySet: typeof p.query_set === "string" ? p.query_set : null,
    title: paper.title ?? (paper.kind === "patent" ? "Untitled patent" : "Untitled paper"),
    score: best,
    blocks,
    year: typeof p.year === "number" ? p.year : null,
    venue: typeof p.venue === "string" ? p.venue : null,
    field: typeof p.field === "string" ? p.field : null,
    url: typeof p.url === "string" ? p.url : typeof p.doi === "string" ? `https://doi.org/${p.doi}` : null,
    yours: isHeld(held, p),
    addedAt: paper.addedAt,
  };
}

const corpusSources = sql.join(CORPUS_SOURCES.map((s) => sql`${s}`), sql`, `);

/** The k closest papers to this card, or an empty list when the card has no
 *  vectors yet. `since` narrows to papers added after a date, for the digest.
 *  A paper the author listed as already held is ranked like any other and
 *  flagged `yours`. One card's call of `priorArtForMany`. */
export async function priorArtFor(db: Db, ideaId: string, k = 5, since?: Date): Promise<PaperHit[]> {
  return (await priorArtForMany(db, [ideaId], k, since)).get(ideaId) ?? [];
}

/** Prior art for every card in one ranking statement, each card's hits as
 *  `priorArtFor` gives them. Every requested id is a key; a card with no
 *  vectors maps to `[]`.
 *
 *  Ranked in the database; only the hits' per-block cosines come back.
 *  Candidates are, per card, the union of each of its rows' k nearest chunks
 *  by the HNSW index. The union is exact: a paper in the card's true top k is
 *  in its own best row's top k, since anything nearer that row also scores
 *  above it. Keyed by card, so no card is scored against another's
 *  candidates. The candidates are then scored exactly, the corpus side cast
 *  up from half precision. `since` skips the index and scores every document
 *  added since, a week of ingest, which a filtered index scan could
 *  under-return; that set is the same for every card and is scanned once.
 *  The order is best cosine, then newest, then document id: total, so a tie
 *  at the cut is never arbitrary.
 *
 *  A caller that already holds the cards' vectors, or their documents (for
 *  the `yours` flag), passes them and they are not read again. */
export async function priorArtForMany(
  db: Db,
  ideaIds: string[],
  k = 5,
  since?: Date,
  given: { vectors?: Map<string, IdeaVector[]>; cards?: { ideaId: string; doc: Record<string, unknown> }[] } = {},
): Promise<Map<string, PaperHit[]>> {
  const out = new Map<string, PaperHit[]>(ideaIds.map((id) => [id, []]));
  const vectors = given.vectors ?? (await ideaVectors(db, ideaIds));
  const cards = ideaIds.filter((id) => (vectors.get(id) ?? []).length > 0);
  // An empty `values` list is a syntax error, and there is nothing to rank.
  if (cards.length === 0) return out;
  const docs = given.cards ?? (await db.select({ ideaId: forgeCard.ideaId, doc: forgeCard.doc }).from(forgeCard).where(inArray(forgeCard.ideaId, cards)));
  const held = new Map(docs.map((c) => [c.ideaId, heldPapers(c.doc)]));

  const dims = sql.raw(String(EMBEDDING_DIMENSIONS));
  const q = sql.join(
    cards.flatMap((id) => vectors.get(id)!.map((r) => sql`(${id}, ${r.block}, ${JSON.stringify(r.embedding)}::vector(${dims}))`)),
    sql`, `,
  );
  const perBlock = since
    ? sql`select q.card, c.document_id, q.block, max(1 - (c.embedding::vector <=> q.v)) as cos
          from (select d.id as document_id from document d
                where d.source in (${corpusSources}) and d.created_at >= ${since.toISOString()}) candidates
          join document_chunk c on c.document_id = candidates.document_id cross join q
          where c.embedding is not null
          group by q.card, c.document_id, q.block`
    : sql`select q.card, c.document_id, q.block, max(1 - (c.embedding::vector <=> q.v)) as cos
          from (select distinct q.card, n.document_id from q cross join lateral (
                  select c.document_id from document_chunk c join document d on d.id = c.document_id
                  where d.source in (${corpusSources}) and c.embedding is not null
                  order by c.embedding <=> q.v::halfvec(${dims})
                  limit ${k}
                ) n) candidates
          join document_chunk c on c.document_id = candidates.document_id
          join q on q.card = candidates.card
          where c.embedding is not null
          group by q.card, c.document_id, q.block`;
  const result = await db.execute(sql`
    with q(card, block, v) as (values ${q}),
    per_block as (${perBlock}),
    ranked as (
      select p.card, p.document_id,
        row_number() over (partition by p.card order by max(p.cos) desc, d.created_at desc, p.document_id) as rank
      from per_block p join document d on d.id = p.document_id
      group by p.card, p.document_id, d.created_at
    ),
    best as (select card, document_id, rank from ranked where rank <= ${k})
    select p.card, p.document_id, p.block, p.cos, best.rank from per_block p join best using (card, document_id)`);
  const scored = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as { card: string; document_id: string; block: string; cos: number | string; rank: number | string }[];
  if (scored.length === 0) return out;

  // Per card, each document's block map is seeded in the card's row order,
  // as `scorePaper` fills it, so blocks that tie are named in the same order.
  const byCard = new Map<string, Map<string, { rank: number; blocks: Map<string, number> }>>();
  for (const s of scored) {
    const docsOf = byCard.get(s.card) ?? new Map();
    const hit = docsOf.get(s.document_id) ?? { rank: Number(s.rank), blocks: new Map(vectors.get(s.card)!.map((r) => [r.block, -Infinity])) };
    hit.blocks.set(s.block, Number(s.cos));
    docsOf.set(s.document_id, hit);
    byCard.set(s.card, docsOf);
  }
  const meta = await db
    .select({ documentId: document.id, kind: document.source, title: document.title, provenance: artifactTexts.provenance, addedAt: document.createdAt })
    .from(document)
    .leftJoin(artifactTexts, eq(artifactTexts.artifactId, document.id))
    .where(inArray(document.id, [...new Set(scored.map((s) => s.document_id))]))
    .orderBy(desc(document.createdAt), desc(artifactTexts.version));
  // The newest text's provenance per document, as the single form read it.
  const metaById = new Map<string, (typeof meta)[number]>();
  for (const m of meta) if (!metaById.has(m.documentId)) metaById.set(m.documentId, m);

  for (const [card, docsOf] of byCard) {
    out.set(card, [...docsOf.entries()]
      // The database's order, not re-derived here: a `Date` holds
      // milliseconds and `created_at` microseconds.
      .sort((a, b) => a[1].rank - b[1].rank)
      .map(([id, hit]) => {
        const m = metaById.get(id)!;
        return hitFrom({ ...m, kind: m.kind as CorpusKind }, hit.blocks, held.get(card) ?? new Set());
      }));
  }
  return out;
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
