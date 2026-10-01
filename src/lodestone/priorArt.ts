/** Prior art for a card: the papers whose abstracts sit closest to any of
 *  the card's blocks. Works with no other member in the cohort — the corpus
 *  comes to the card.
 *
 *  Abstracts are embedded whole into `document_chunk`, the column the
 *  schema reserved and nothing had written. No model reads the paper: the
 *  match is cosine between the card's block vectors and the abstract, and
 *  the explanation is which block came closest. */
import { and, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { artifactTexts, document, documentChunk } from "@/db/schema";
import type { Embedder } from "./cards";
import { blockLabel } from "./cards";
import { cosine, ideaVectors, type IdeaVector } from "./vectors";

/** Embed every paper whose abstract has no chunk yet. Returns how many. */
export async function embedPaperAbstracts(db: Db, embed: Embedder): Promise<number> {
  const missing = await db
    .select({ id: document.id, text: document.text })
    .from(document)
    .leftJoin(documentChunk, eq(documentChunk.documentId, document.id))
    .where(and(eq(document.source, "paper"), isNull(documentChunk.id)));
  if (missing.length === 0) return 0;
  const result = await embed(missing.map((m) => m.text), "document");
  if (!result.embedded) return 0;
  let written = 0;
  for (const [at, m] of missing.entries()) {
    const vector = result.vectors[at];
    if (!vector) continue;
    await db.insert(documentChunk).values({ documentId: m.id, ordinal: 0, text: m.text, embedding: vector });
    written += 1;
  }
  return written;
}

export interface PaperHit {
  documentId: string;
  title: string;
  score: number;
  /** The block that came closest, then any other within a hair of it. */
  blocks: string[];
  year: number | null;
  venue: string | null;
  field: string | null;
  url: string | null;
  addedAt: Date;
}

interface PaperRow {
  documentId: string;
  title: string | null;
  embedding: number[];
  provenance: Record<string, unknown> | null;
  addedAt: Date;
}

async function papers(db: Db, since?: Date): Promise<PaperRow[]> {
  const rows = await db
    .select({
      documentId: document.id,
      title: document.title,
      embedding: documentChunk.embedding,
      provenance: artifactTexts.provenance,
      addedAt: document.createdAt,
    })
    .from(documentChunk)
    .innerJoin(document, eq(document.id, documentChunk.documentId))
    .leftJoin(artifactTexts, eq(artifactTexts.artifactId, document.id))
    .where(and(eq(document.source, "paper"), isNotNull(documentChunk.embedding), since ? gte(document.createdAt, since) : sql`true`))
    .orderBy(desc(document.createdAt));
  const seen = new Set<string>();
  return rows
    .filter((r) => (seen.has(r.documentId) ? false : (seen.add(r.documentId), true)))
    .map((r) => ({ ...r, embedding: r.embedding as number[] }));
}

export function scorePaper(rows: IdeaVector[], paper: PaperRow): PaperHit {
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
    title: paper.title ?? "Untitled paper",
    score: best,
    blocks,
    year: typeof p.year === "number" ? p.year : null,
    venue: typeof p.venue === "string" ? p.venue : null,
    field: typeof p.field === "string" ? p.field : null,
    url: typeof p.url === "string" ? p.url : typeof p.doi === "string" ? `https://doi.org/${p.doi}` : null,
    addedAt: paper.addedAt,
  };
}

/** The k closest papers to this card, or an empty list when the card has no
 *  vectors yet. `since` narrows to papers added after a date, for the digest. */
export async function priorArtFor(db: Db, ideaId: string, k = 5, since?: Date): Promise<PaperHit[]> {
  const rows = (await ideaVectors(db, [ideaId])).get(ideaId) ?? [];
  if (rows.length === 0) return [];
  const corpus = await papers(db, since);
  return corpus
    .map((p) => scorePaper(rows, p))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** How many papers the corpus holds with a vector. */
export async function corpusSize(db: Db): Promise<number> {
  return (await papers(db)).length;
}
