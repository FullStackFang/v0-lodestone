/** Prior art for a card: the papers whose abstracts sit closest to any of
 *  the card's blocks. Works with no other member in the cohort — the corpus
 *  comes to the card.
 *
 *  Abstracts are embedded whole into `document_chunk`, the column the
 *  schema reserved and nothing had written. No model reads the paper: the
 *  match is cosine between the card's block vectors and the abstract, and
 *  the explanation is which block came closest. */
import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { artifactTexts, document, documentChunk } from "@/db/schema";
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
 *  embedded and leaves the rest for the next call. */
export async function embedPaperAbstracts(db: Db, embed: Embedder, batch = EMBED_BATCH): Promise<number> {
  const missing = await db
    .select({ id: document.id, text: document.text })
    .from(document)
    .leftJoin(documentChunk, eq(documentChunk.documentId, document.id))
    .where(and(inArray(document.source, [...CORPUS_SOURCES]), isNull(documentChunk.id)));
  let written = 0;
  for (let from = 0; from < missing.length; from += batch) {
    const slice = missing.slice(from, from + batch);
    const result = await embed(slice.map((m) => m.text), "document");
    if (!result.embedded) return written;
    for (const [at, m] of slice.entries()) {
      const vector = result.vectors[at];
      if (!vector) continue;
      await db.insert(documentChunk).values({ documentId: m.id, ordinal: 0, text: m.text, embedding: vector });
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

interface PaperRow {
  documentId: string;
  kind: CorpusKind;
  title: string | null;
  embedding: number[];
  provenance: Record<string, unknown> | null;
  addedAt: Date;
}

async function papers(db: Db, since?: Date): Promise<PaperRow[]> {
  const rows = await db
    .select({
      documentId: document.id,
      kind: document.source,
      title: document.title,
      embedding: documentChunk.embedding,
      provenance: artifactTexts.provenance,
      addedAt: document.createdAt,
    })
    .from(documentChunk)
    .innerJoin(document, eq(document.id, documentChunk.documentId))
    .leftJoin(artifactTexts, eq(artifactTexts.artifactId, document.id))
    .where(and(inArray(document.source, [...CORPUS_SOURCES]), isNotNull(documentChunk.embedding), since ? gte(document.createdAt, since) : sql`true`))
    .orderBy(desc(document.createdAt));
  const seen = new Set<string>();
  return rows
    .filter((r) => (seen.has(r.documentId) ? false : (seen.add(r.documentId), true)))
    .map((r) => ({ ...r, kind: r.kind as CorpusKind, embedding: r.embedding as number[] }));
}

export function scorePaper(rows: IdeaVector[], paper: PaperRow, held: Set<string> = new Set()): PaperHit {
  let best = -Infinity;
  const byBlock = new Map<string, number>();
  for (const r of rows) {
    const c = cosine(r.embedding, paper.embedding);
    if (c > best) best = c;
    byBlock.set(r.block, Math.max(byBlock.get(r.block) ?? -Infinity, c));
  }
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

/** The k closest papers to this card, or an empty list when the card has no
 *  vectors yet. `since` narrows to papers added after a date, for the digest.
 *  A paper the author listed as already held is ranked like any other and
 *  flagged `yours`. */
export async function priorArtFor(db: Db, ideaId: string, k = 5, since?: Date): Promise<PaperHit[]> {
  const rows = (await ideaVectors(db, [ideaId])).get(ideaId) ?? [];
  if (rows.length === 0) return [];
  const [card] = await db.select({ doc: forgeCard.doc }).from(forgeCard).where(eq(forgeCard.ideaId, ideaId)).limit(1);
  const held = card ? heldPapers(card.doc) : new Set<string>();
  const corpus = await papers(db, since);
  return corpus
    .map((p) => scorePaper(rows, p, held))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** How many papers the corpus holds with a vector. */
export async function corpusSize(db: Db): Promise<number> {
  return (await papers(db)).length;
}

export interface CorpusDocument {
  documentId: string;
  kind: CorpusKind;
  title: string | null;
  /** The canonical abstract — the only text Lodestone holds for a work. */
  abstract: string;
  provenance: Record<string, unknown>;
  citation: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One paper or patent as the read endpoint serves it, or null for any id
 *  that is not one — a card's idea id included. */
export async function corpusDocument(db: Db, documentId: string): Promise<CorpusDocument | null> {
  if (!UUID.test(documentId)) return null;
  const [row] = await db
    .select({ kind: document.source, title: document.title, text: document.text, canonical: artifactTexts.canonicalText, provenance: artifactTexts.provenance })
    .from(document)
    .leftJoin(artifactTexts, eq(artifactTexts.artifactId, document.id))
    .where(and(eq(document.id, documentId), inArray(document.source, [...CORPUS_SOURCES])))
    .orderBy(desc(artifactTexts.version))
    .limit(1);
  if (!row) return null;
  const kind = row.kind as CorpusKind;
  const provenance = row.provenance ?? {};
  return { documentId, kind, title: row.title, abstract: row.canonical ?? row.text, provenance, citation: citationFor(kind, provenance, row.title) };
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
