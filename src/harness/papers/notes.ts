/** A margin note is not a slice of the abstract.
 *
 * At session end every note in the sitting goes through one `structured`
 * call — one, not one per note — and comes back labelled `query`,
 * `observation` or `other`. The label and the prompt's version are written
 * on the annotation, so the classification survives for notes that spawn no
 * assertion.
 *
 * A `query` becomes a purpose of the *reader's*, on their own person
 * subject, with **no text hash and no selectors**: the ledger's
 * quote-equals-slice rule applies whenever a hash is set, and a question in
 * the reader's own words is not a quotation of the paper. Where it was
 * asked lives in provenance instead.
 *
 * The rungs come from the contract's own `ladder` over the classification
 * run — the same pass the extractor's purposes get, so a reader's question
 * and a paper's purpose are comparable at the abstract rung the band-pass
 * scores on. */
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import {
  annotations,
  assertions,
  extractionRuns,
  readingSessions,
  type AnnotationRow,
} from "@/db/schema";
import { ladder as realLadder } from "../extract/ladder";
import { runModel } from "../extract/core";
import { embed as realEmbed } from "../embed";
import { insertAssertion, readerPerson } from "../ledger";
import { structured as realStructured } from "../model";
import { NoteKind, type Provenance } from "../schema";
import { tagMapping } from "./annotate";
import { harnessPrompt } from "./prompts";

export const NoteLabels = z
  .object({
    labels: z.array(
      z
        .object({
          annotationId: z.string(),
          kind: NoteKind,
        })
        .loose(),
    ),
  })
  .loose();
export type NoteLabels = z.infer<typeof NoteLabels>;

export interface NoteClassification {
  /** What the model said, after unknown ids were dropped. */
  labels: { annotationId: string; kind: z.infer<typeof NoteKind> }[];
  /** Assertion ids for the notes that turned out to be questions. */
  purposeIds: string[];
  /** The run the rungs were lifted on, when there was anything to lift. */
  ladderRunId: string | null;
}

export interface NotesDeps {
  structured?: typeof realStructured;
  embed?: typeof realEmbed;
  ladder?: typeof realLadder;
}

/** The notes in a sitting: the annotations whose map row files nothing. */
async function notesOf(db: Db, sessionId: string): Promise<AnnotationRow[]> {
  const rows = await db.select().from(annotations).where(eq(annotations.sessionId, sessionId));
  const out: AnnotationRow[] = [];
  for (const row of rows) {
    if (row.note === null) continue;
    const mapping = await tagMapping(db, row.tag, row.mechanismSubtype);
    if (mapping && !mapping.writesAssertion) out.push(row);
  }
  return out;
}

/**
 * Classify a session's notes and file the questions.
 *
 * Returns null when the sitting had no notes — no model call is made for an
 * empty list. A failed call leaves the notes unlabelled rather than
 * guessing; they are classified on the next end of a session that contains
 * them.
 */
export async function classifySessionNotes(
  db: Db,
  sessionId: string,
  deps: NotesDeps = {},
): Promise<NoteClassification | null> {
  const structured = deps.structured ?? realStructured;
  const embed = deps.embed ?? realEmbed;
  const ladder = deps.ladder ?? realLadder;

  const notes = await notesOf(db, sessionId);
  if (notes.length === 0) return null;

  const sessions = await db.select().from(readingSessions).where(eq(readingSessions.id, sessionId)).limit(1);
  const session = sessions[0];
  if (!session) return null;

  const prompt = harnessPrompt("note-classify");
  const listing = notes
    .map((note) => `- id: ${note.id}\n  highlighted: ${JSON.stringify(note.quote)}\n  note: ${JSON.stringify(note.note)}`)
    .join("\n");

  let response;
  try {
    response = await structured(NoteLabels, {
      system: prompt.system,
      prompt: `Notes from one reading:\n\n${listing}`,
    });
  } catch {
    return null;
  }

  const known = new Map(notes.map((note) => [note.id, note]));
  const labels = response.output.labels.filter((label) => known.has(label.annotationId));

  for (const label of labels) {
    await db
      .update(annotations)
      .set({ noteKind: label.kind, notePromptVersion: prompt.promptVersion })
      .where(eq(annotations.id, label.annotationId));
  }

  const queries = labels.filter((label) => label.kind === "query");
  if (queries.length === 0) return { labels, purposeIds: [], ladderRunId: null };

  const readerId = await readerPerson(db);
  const run = await classificationRun(db, session.textHash, prompt.promptVersion);

  const texts = queries.map((label) => known.get(label.annotationId)!.note!);
  const vectors = await embed(texts, "document");

  const purposeIds: string[] = [];
  for (const [at, label] of queries.entries()) {
    const note = known.get(label.annotationId)!;
    const vector = vectors.vectors[at] ?? null;
    const written = await insertAssertion(db, {
      subjectType: "person",
      subjectId: readerId,
      facet: "purpose",
      abstractionLevel: "specific",
      text: note.note!,
      sourceType: "annotation",
      sourceArtifactId: session.artifactId,
      // No hash, no selectors: the question is the reader's sentence.
      textHash: null,
      provenance: {
        kind: "annotation",
        annotation_id: note.id,
        artifact_id: session.artifactId,
        context_text_hash: session.textHash,
        context_quote: note.quote,
        context_start: note.startOff,
        context_end: note.endOff,
      } as Provenance,
      extractionRunId: run.id,
      confidence: "confirmed",
      embedding: vector,
      embeddingModel: vector ? vectors.model : null,
    });
    purposeIds.push(written.id);
  }

  // The contract's ladder, over the run those rows belong to. Its cache is
  // keyed on the text, so a second sitting over the same abstract with new
  // questions returns the earlier run: the rungs for those questions are
  // lifted the next time the prompt version moves. Noted as a gap rather
  // than worked around with a second ladder implementation.
  const lifted = await ladder(db, run.id, { structured, embed });

  return { labels, purposeIds, ladderRunId: lifted.id };
}

/** The run the reader's questions belong to. One per (text, prompt
 *  version, model); the questions of two sittings share it. */
async function classificationRun(db: Db, textHash: string, promptVersion: string) {
  const model = runModel();
  const existing = await db
    .select()
    .from(extractionRuns)
    .where(
      and(
        eq(extractionRuns.textHash, textHash),
        eq(extractionRuns.variant, "note-classify"),
        eq(extractionRuns.promptVersion, promptVersion),
        eq(extractionRuns.model, model),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0];

  const [row] = await db
    .insert(extractionRuns)
    .values({
      textHash,
      variant: "note-classify",
      promptVersion,
      coreVersion: promptVersion,
      model,
      attempt: 1,
      status: "ok",
      stats: { unanchored: 0, ambiguous: 0, dropped_invalid: 0, embedded: false },
      finishedAt: new Date(),
    })
    .returning();
  return row;
}

/** The reader's question-purposes — every `query` note they have filed. */
export async function readerQuestions(db: Db, readerId: string) {
  return db
    .select()
    .from(assertions)
    .where(
      and(
        eq(assertions.subjectType, "person"),
        eq(assertions.subjectId, readerId),
        eq(assertions.facet, "purpose"),
        eq(assertions.sourceType, "annotation"),
        eq(assertions.status, "active"),
        isNull(assertions.textHash),
      ),
    );
}
