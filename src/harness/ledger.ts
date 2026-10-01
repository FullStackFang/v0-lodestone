/** Every write to the ledger goes through here.
 *
 * Two of the rules below are also database CHECKs, on purpose: a track that
 * reaches past this module still cannot write a `confirmed` row from an
 * abstract. The rules that need a join — a different reader, a different
 * source — can only live here, so this is the only path a caller should use.
 *
 * There is no delete. Not a guarded one, not an internal one: `supersede`
 * is how a row stops being current, and in production the app role has
 * `DELETE ON assertions` revoked as well.
 */
import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  annotations,
  assertions,
  judgments,
  matchResults,
  person,
  readingSessions,
  session,
  type AssertionRow,
} from "@/db/schema";
import { getCanonicalText } from "./canonical";
import {
  Judgment,
  type Confidence,
  type Facet,
  type Provenance,
  type SubjectType,
} from "./schema";

/** The quote a caller passed does not match the text it claims to slice. */
export class QuoteMismatch extends Error {}
/** A confidence the caller is not allowed to write, or to move to. */
export class ConfidenceNotAllowed extends Error {}

/** Context either side of a quote, for re-anchoring after a re-parse. */
const CONTEXT = 30;

export interface InsertAssertionInput {
  subjectType: SubjectType;
  subjectId: string;
  facet: Facet | null;
  abstractionLevel?: "specific" | "abstract" | "core" | null;
  text: string;
  sourceType:
    | "abstract"
    | "deck"
    | "resume"
    | "canvas"
    | "jtbd"
    | "conversation"
    | "annotation"
    | "subject_edit";
  sourceArtifactId?: string | null;
  textHash?: string | null;
  startOff?: number | null;
  endOff?: number | null;
  quote?: string | null;
  provenance: Provenance;
  extractionRunId?: string | null;
  confidence?: Confidence;
  evidenceType?: "observed_behavior" | "incurred_cost" | "stated_opinion" | "model_inference" | null;
  embedding?: number[] | null;
  embeddingModel?: string | null;
}

/** `not_stated` is a row, never an absence — and never a vector. Embedding
 *  the literal string would put one identical vector into every facet and
 *  pollute every max-cosine. */
export const NOT_STATED = "not_stated";

async function assertConfidenceAllowed(db: Db, input: InsertAssertionInput): Promise<void> {
  const confidence = input.confidence ?? "extracted";
  if (confidence === "confirmed" && input.sourceType !== "annotation" && input.sourceType !== "subject_edit") {
    throw new ConfidenceNotAllowed(
      `confirmed is the subject's own mark: source_type ${input.sourceType} cannot write it`,
    );
  }
  if (confidence === "corroborated") {
    const by = (input.provenance as Record<string, unknown>).corroborated_by;
    if (typeof by !== "string" || by.length === 0) {
      throw new ConfidenceNotAllowed("corroborated must name the annotation in provenance.corroborated_by");
    }
    const reader = await annotationReader(db, by);
    if (reader === null) throw new ConfidenceNotAllowed(`corroborated_by names no annotation (${by})`);
    if (reader === input.subjectId) {
      throw new ConfidenceNotAllowed("corroborated needs a different reader — a subject cannot corroborate itself");
    }
  }
}

/** The `person.id` that made an annotation, through its reading session. */
async function annotationReader(db: Db, annotationId: string): Promise<string | null> {
  const rows = await db
    .select({ readerId: readingSessions.readerId })
    .from(annotations)
    .innerJoin(readingSessions, eq(annotations.sessionId, readingSessions.id))
    .where(eq(annotations.id, annotationId))
    .limit(1);
  return rows[0]?.readerId ?? null;
}

/** The row values, with the quote checked and the context recomputed. The
 *  caller's prefix and suffix are never trusted: they are what re-anchoring
 *  depends on, and a caller that got them wrong would poison the recovery. */
async function rowValuesFor(db: Db, input: InsertAssertionInput) {
  const hasText = input.textHash != null;
  let prefix: string | null = null;
  let suffix: string | null = null;

  if (hasText) {
    const { startOff, endOff, quote } = input;
    if (startOff == null || endOff == null || quote == null) {
      throw new QuoteMismatch("an assertion with a text_hash needs start_off, end_off and quote");
    }
    const canonical = await getCanonicalText(db, input.textHash!);
    if (canonical === null) throw new QuoteMismatch(`no artifact_texts row for ${input.textHash}`);
    const slice = canonical.slice(startOff, endOff);
    if (slice !== quote) {
      throw new QuoteMismatch(
        `quote does not match the canonical text at [${startOff}, ${endOff}): ` +
          `${JSON.stringify(quote)} vs ${JSON.stringify(slice)}`,
      );
    }
    prefix = canonical.slice(Math.max(0, startOff - CONTEXT), startOff);
    suffix = canonical.slice(endOff, endOff + CONTEXT);
  }

  if (input.text === NOT_STATED && input.embedding != null) {
    throw new QuoteMismatch("a not_stated row is never embedded");
  }

  return {
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    facet: input.facet,
    abstractionLevel: input.abstractionLevel ?? null,
    text: input.text,
    embedding: input.embedding ?? null,
    embeddingModel: input.embedding == null ? null : (input.embeddingModel ?? null),
    sourceType: input.sourceType,
    sourceArtifactId: input.sourceArtifactId ?? null,
    textHash: input.textHash ?? null,
    startOff: hasText ? input.startOff! : null,
    endOff: hasText ? input.endOff! : null,
    quote: hasText ? input.quote! : null,
    prefix,
    suffix,
    provenance: input.provenance,
    extractionRunId: input.extractionRunId ?? null,
    confidence: input.confidence ?? "extracted",
    evidenceType: input.evidenceType ?? null,
  };
}

/** One assertion. Throws before writing anything when the quote has drifted
 *  or the confidence is not the caller's to award. */
export async function insertAssertion(db: Db, input: InsertAssertionInput): Promise<AssertionRow> {
  await assertConfidenceAllowed(db, input);
  const values = await rowValuesFor(db, input);
  const [row] = await db.insert(assertions).values(values).returning();
  return row;
}

/** Replace a row without losing it. One transaction: a `newRow` that fails
 *  its quote check leaves the old row active and writes nothing. */
export async function supersede(
  db: Db,
  oldId: string,
  newRow: InsertAssertionInput,
  reason?: string,
): Promise<AssertionRow> {
  await assertConfidenceAllowed(db, newRow);
  const values = await rowValuesFor(db, newRow);
  return db.transaction(async (tx) => {
    const [inserted] = await tx.insert(assertions).values(values).returning();
    const updated = await tx
      .update(assertions)
      .set({
        status: "superseded",
        supersededBy: inserted.id,
        ...(reason
          ? { provenance: sql`${assertions.provenance} || ${JSON.stringify({ superseded_reason: reason })}::jsonb` }
          : {}),
      })
      .where(and(eq(assertions.id, oldId), eq(assertions.status, "active")))
      .returning({ id: assertions.id });
    if (updated.length === 0) throw new Error(`no active assertion ${oldId} to supersede`);
    return inserted;
  });
}

const RUNGS: Confidence[] = ["extracted", "repeated", "corroborated", "confirmed"];

export interface UpgradeCitation {
  /** For `repeated`: the second source that said it again. */
  sourceArtifactId?: string;
  stageEventId?: string;
  /** For `corroborated`: the annotation, by someone who is not the subject. */
  annotationId?: string;
}

/** One rung at a time, and never to `confirmed` — that is the subject's own
 *  mark, written at insert from their own annotation or edit. */
export async function upgradeConfidence(
  db: Db,
  id: string,
  to: Confidence,
  citation: UpgradeCitation = {},
): Promise<AssertionRow> {
  const rows = await db.select().from(assertions).where(eq(assertions.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw new Error(`no assertion ${id}`);

  if (to === "confirmed") {
    throw new ConfidenceNotAllowed("confirmed is written by the subject, never by an upgrade");
  }
  if (RUNGS.indexOf(to) !== RUNGS.indexOf(row.confidence) + 1) {
    throw new ConfidenceNotAllowed(`${row.confidence} → ${to} is not one rung`);
  }

  const patch: Record<string, unknown> = {};

  if (to === "repeated") {
    const cited = citation.sourceArtifactId ?? citation.stageEventId;
    if (!cited) throw new ConfidenceNotAllowed("repeated must cite the second source");
    const own = (row.provenance as Record<string, unknown>).stage_event_id;
    if (cited === row.sourceArtifactId || cited === own) {
      throw new ConfidenceNotAllowed("repeated needs a different source than the assertion's own");
    }
    patch.repeated_by = cited;
  }

  if (to === "corroborated") {
    const { annotationId } = citation;
    if (!annotationId) throw new ConfidenceNotAllowed("corroborated must cite the annotation");
    const reader = await annotationReader(db, annotationId);
    if (reader === null) throw new ConfidenceNotAllowed(`no annotation ${annotationId}`);
    if (reader === row.subjectId) {
      throw new ConfidenceNotAllowed("corroborated needs a different reader — a subject cannot corroborate itself");
    }
    patch.corroborated_by = annotationId;
  }

  const [updated] = await db
    .update(assertions)
    .set({
      confidence: to,
      provenance: sql`${assertions.provenance} || ${JSON.stringify(patch)}::jsonb`,
    })
    .where(eq(assertions.id, id))
    .returning();
  return updated;
}

/** A judgment, whole, and the exposure it implies. A result judged is a
 *  result that was shown. */
export async function recordJudgment(db: Db, input: unknown) {
  const j = Judgment.parse(input);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(judgments)
      .values({
        readerId: j.readerId,
        edgeType: j.edgeType,
        queryAssertionId: j.queryAssertionId,
        candidateSubjectId: j.candidateSubjectId,
        candidateAssertionIds: j.candidateAssertionIds,
        matchResultId: j.matchResultId,
        rank: j.rank,
        verdict: j.verdict,
        context: j.context,
      })
      .returning();
    await tx
      .update(matchResults)
      .set({ shownAt: row.createdAt })
      .where(and(eq(matchResults.id, j.matchResultId), isNull(matchResults.shownAt)));
    return row;
  });
}

/** A name and an email. Email is the identity and is matched case-folded —
 *  a student who types `A@B.edu` on Tuesday is the same person. */
export async function ensurePerson(db: Db, input: { name: string; email: string }): Promise<string> {
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("ensurePerson needs an email");
  const existing = await db.select({ id: person.id }).from(person).where(eq(person.email, email)).limit(1);
  if (existing[0]) return existing[0].id;
  const [row] = await db
    .insert(person)
    .values({ name: input.name.trim(), email })
    .onConflictDoNothing({ target: person.email })
    .returning({ id: person.id });
  if (row) return row.id;
  // Lost a race; the winner's row is the answer.
  const again = await db.select({ id: person.id }).from(person).where(eq(person.email, email)).limit(1);
  return again[0].id;
}

export async function linkSession(db: Db, sessionId: string, personId: string): Promise<void> {
  await db.update(session).set({ personId }).where(eq(session.id, sessionId));
}

/** The instructor reading the papers is a `person` too — one identity
 *  scheme for students and the harness. */
export async function readerPerson(db: Db): Promise<string> {
  const email = process.env.HARNESS_READER_EMAIL?.trim() || "reader@harness.local";
  const name = process.env.HARNESS_READER_NAME?.trim() || "Harness reader";
  return ensurePerson(db, { name, email });
}

/** sha256 over both subjects' sorted active assertion ids. A one-sided hash
 *  serves a stale card when the candidate has moved, which is why both go in. */
export async function assertionSetHash(db: Db, subjectIds: string[]): Promise<string> {
  const rows = await db
    .select({ id: assertions.id })
    .from(assertions)
    .where(and(inArray(assertions.subjectId, subjectIds), eq(assertions.status, "active")));
  const ids = rows.map((r) => r.id).sort();
  return createHash("sha256").update(ids.join("\n"), "utf8").digest("hex");
}
