/** The "why" of a prior-art hit: the abstract sentences nearest the block it
 *  matched. The abstract is cut by a rule, each sentence embedded once into
 *  `document_sentence`, and the three nearest a block are a cosine lookup.
 *  No model reads the paper; Whetstone does the reading. */
import { desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { EMBEDDING_DIMENSIONS, artifactTexts, documentSentence } from "@/db/schema";
import { getCanonicalText } from "@/harness/canonical";
import type { Embedder } from "./cards";
import type { HitSentence, PaperHit } from "./priorArt";
import { ideaVectors, type IdeaVector } from "./vectors";

export interface Sentence {
  /** UTF-16 offsets into the text that was split: `text.slice(start, end)`. */
  start: number;
  end: number;
  text: string;
}

/** Words that end in a full stop without ending a sentence. A single initial
 *  (`J.`) is caught by its shape. */
const PROTECTED = new Set(["e.g.", "i.e.", "al.", "fig.", "figs.", "vs.", "cf.", "eq.", "approx.", "dr.", "mr.", "mrs.", "ms.", "prof."]);
/** A sentence end: the mark, any closing quote or bracket, then whitespace
 *  and a capital or a digit, perhaps behind an opening quote or bracket. Or,
 *  since OpenAlex rebuilds many abstracts with no space between sentences,
 *  the mark straight after a word, a digit or a bracket and straight before
 *  a capitalised word: `cities.It`, `2001).Results`, never `U.S.A` or `2.5`. */
const BOUNDARY = /[.?!]["'”’)\]]*(?=\s+["'“‘(\[]?[A-Z0-9])|(?<=[a-z]{2}|[\d)\]])[.?!](?=[A-Z][a-z])/g;
/** Shorter than this, a piece joins its neighbour. */
const MIN_WORDS = 4;

function protectedStop(text: string, at: number): boolean {
  if (text[at] !== ".") return false;
  const word = (/(\S+)$/.exec(text.slice(0, at + 1))?.[1] ?? "").replace(/^["'“‘(\[]+/, "").toLowerCase();
  return PROTECTED.has(word) || /^[a-z]\.$/.test(word);
}

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Cut a text into sentences. Deterministic, not perfect: a full stop, a
 *  question or an exclamation mark ends a sentence when a capital or a digit
 *  follows (see `BOUNDARY`), unless it closes a protected abbreviation. A piece under four
 *  words joins the sentence before it, or the one after when it opens the
 *  text. */
export function splitSentences(text: string): Sentence[] {
  const first = text.search(/\S/);
  if (first < 0) return [];
  const last = text.trimEnd().length;
  const raw: { start: number; end: number }[] = [];
  let start = first;
  for (const m of text.matchAll(BOUNDARY)) {
    if (protectedStop(text, m.index)) continue;
    const end = m.index + m[0].length;
    raw.push({ start, end });
    start = end + (/^\s+/.exec(text.slice(end))?.[0].length ?? 0);
  }
  if (start < last) raw.push({ start, end: last });

  const out: { start: number; end: number }[] = [];
  let opening: number | null = null;
  for (const s of raw) {
    const short = wordCount(text.slice(s.start, s.end)) < MIN_WORDS;
    if (short && out.length) out[out.length - 1].end = s.end;
    else if (short) opening ??= s.start;
    else {
      out.push({ start: opening ?? s.start, end: s.end });
      opening = null;
    }
  }
  if (opening !== null) out.push({ start: opening, end: raw[raw.length - 1].end });
  return out.map((s) => ({ ...s, text: text.slice(s.start, s.end) }));
}

/** Cut and embed the sentences of each document whose rows are missing or
 *  were cut from an older text, in one embed call. Returns how many
 *  documents were cut. A document whose rows carry its newest `text_hash`
 *  costs nothing; without an embedding key nothing is written. */
export async function ensureSentences(db: Db, embed: Embedder, documentIds: string[]): Promise<number> {
  if (documentIds.length === 0) return 0;
  const texts = await db
    .select({ id: artifactTexts.artifactId, text: artifactTexts.canonicalText, hash: artifactTexts.textHash })
    .from(artifactTexts)
    .where(inArray(artifactTexts.artifactId, documentIds))
    .orderBy(artifactTexts.artifactId, desc(artifactTexts.version));
  const cut = await db
    .selectDistinct({ id: documentSentence.documentId, hash: documentSentence.textHash })
    .from(documentSentence)
    .where(inArray(documentSentence.documentId, documentIds));
  const hashes = new Map<string, Set<string>>();
  for (const c of cut) hashes.set(c.id, (hashes.get(c.id) ?? new Set()).add(c.hash));

  const seen = new Set<string>();
  const todo = texts
    .filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
    .filter((t) => {
      const have = hashes.get(t.id);
      return !(have?.size === 1 && have.has(t.hash));
    })
    .map((t) => ({ ...t, sentences: splitSentences(t.text) }))
    .filter((t) => t.sentences.length > 0);
  if (todo.length === 0) return 0;

  const result = await embed(todo.flatMap((t) => t.sentences.map((s) => s.text)), "document");
  if (!result.embedded) return 0;
  let at = 0;
  let written = 0;
  for (const t of todo) {
    const vectors = t.sentences.map(() => result.vectors[at++]);
    if (vectors.some((v) => !v)) continue;
    await db.transaction(async (tx) => {
      await tx.delete(documentSentence).where(eq(documentSentence.documentId, t.id));
      await tx
        .insert(documentSentence)
        .values(t.sentences.map((s, ordinal) => ({ documentId: t.id, ordinal, textHash: t.hash, startOff: s.start, endOff: s.end, embedding: vectors[ordinal]! })))
        // A second reader cutting the same text at once wrote the same rows.
        .onConflictDoNothing();
    });
    written += 1;
  }
  return written;
}

/** Sentences returned per hit. */
const PER_HIT = 3;

/** The three sentences of the hit's abstract with the highest cosine to any
 *  entry of its first block, in abstract order. Only rows cut from the text
 *  under `abstractHash` count, so a stale cut returns nothing rather than
 *  sentences of another abstract. */
export async function sentencesFor(
  db: Db,
  hit: Pick<PaperHit, "documentId" | "blockKeys" | "abstractHash">,
  blockVectors: IdeaVector[],
): Promise<HitSentence[]> {
  const block = hit.blockKeys[0];
  const entries = blockVectors.filter((r) => r.block === block);
  if (!block || !hit.abstractHash || entries.length === 0) return [];
  const q = sql.join(
    entries.map((e) => sql`(${JSON.stringify(e.embedding)}::vector(${sql.raw(String(EMBEDDING_DIMENSIONS))}))`),
    sql`, `,
  );
  const result = await db.execute(sql`
    with q(v) as (values ${q})
    select s.ordinal, s.start_off, s.end_off, max(1 - (s.embedding::vector <=> q.v)) as cos
    from document_sentence s cross join q
    where s.document_id = ${hit.documentId} and s.text_hash = ${hit.abstractHash}
    group by s.ordinal, s.start_off, s.end_off
    order by cos desc, s.ordinal
    limit ${PER_HIT}`);
  const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as { ordinal: number; start_off: number; end_off: number; cos: number | string }[];
  if (rows.length === 0) return [];
  const text = await getCanonicalText(db, hit.abstractHash);
  if (text === null) return [];
  return rows
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((r) => ({ text: text.slice(r.start_off, r.end_off), block, cosine: Number(r.cos) }));
}

/** The hits with their sentences: any document not yet cut is cut first, in
 *  one embed call. A failed embed leaves those hits without sentences; it
 *  never fails the read. */
export async function withSentences(db: Db, embed: Embedder, ideaId: string, hits: PaperHit[]): Promise<PaperHit[]> {
  if (hits.length === 0) return hits;
  try {
    await ensureSentences(db, embed, hits.map((h) => h.documentId));
  } catch {
    // Cut on the next read.
  }
  const rows = (await ideaVectors(db, [ideaId])).get(ideaId) ?? [];
  const out: PaperHit[] = [];
  for (const h of hits) out.push({ ...h, sentences: await sentencesFor(db, h, rows) });
  return out;
}
