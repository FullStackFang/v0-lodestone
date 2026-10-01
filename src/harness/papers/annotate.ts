/** A highlight becomes a row in the ledger, or the save is refused.
 *
 * Two rules carry this file. The first: the quote must equal the slice of
 * the canonical text the offsets name, computed here in TypeScript, never in
 * SQL — the client's idea of what it selected is never the record. The
 * second: what a tag files is a `tag_facet_map` row, including *whether* it
 * files anything. `note` writes no assertion because its row says
 * `writes_assertion = false`, not because this file knows the word "note".
 *
 * The rung comes from the reader's relation to the subject. A paper has no
 * person, so a reader's highlight on it is `confirmed`. A person's document
 * read by that person is `confirmed` too — their own word. A person's
 * document read by someone else is `corroborated`: the reader vouches, the
 * subject did not, and the subject stays the document's person. */
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  annotations,
  assertions,
  document,
  readingSessions,
  reconciliations,
  session,
  tagFacetMap,
  type AnnotationRow,
} from "@/db/schema";
import { getCanonicalText } from "../canonical";
import { insertAssertion } from "../ledger";
import type { Confidence, Facet, Provenance, SubjectType } from "../schema";

/** Context either side of a quote — the contract's own window. */
const CONTEXT = 30;

export class SliceMismatch extends Error {}
export class UnknownTag extends Error {}
export class UnknownSession extends Error {}
/** The annotation is cited by a reconciliation; deleting it would strand it. */
export class AnnotationReferenced extends Error {
  constructor(readonly reconciliationIds: string[]) {
    super(`annotation is referenced by reconciliations ${reconciliationIds.join(", ")}`);
  }
}

export interface SaveAnnotationInput {
  sessionId: string;
  start: number;
  end: number;
  /** What the client believes it selected. Checked, never trusted. */
  selected: string;
  tag: string;
  subtype?: string | null;
  note?: string | null;
}

export interface SaveAnnotationResult {
  annotation: AnnotationRow;
  assertionId: string | null;
  /** Why no assertion was written, when none was. */
  skipped?: "map_says_no" | "no_subject";
}

/** Who or what an artifact's assertions are about. */
export interface Subject {
  subjectType: SubjectType;
  subjectId: string;
}

/**
 * The subject of the artifact being read.
 *
 * A paper: itself. A person's document: that person, through the session
 * that uploaded it. A document with no person — a session from before the
 * founder track's person step — has no subject, and a highlight on it is
 * kept as an annotation without an assertion rather than filed against the
 * reader, who is not its author.
 */
export async function subjectOf(db: Db, artifactId: string): Promise<Subject | null> {
  const rows = await db
    .select({ source: document.source, personId: session.personId })
    .from(document)
    .leftJoin(session, eq(document.sessionId, session.id))
    .where(eq(document.id, artifactId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.source === "paper") return { subjectType: "paper", subjectId: artifactId };
  if (row.personId) return { subjectType: "person", subjectId: row.personId };
  return null;
}

export interface TagMapping {
  facet: Facet | null;
  abstractionLevel: "specific" | "abstract" | "core" | null;
  writesAssertion: boolean;
}

/** The `(tag, subtype)` row, falling back to the tag's untyped row — `how`
 *  with no subtype is the paper's untyped `mechanism`, never
 *  `mechanism.product`. */
export async function tagMapping(db: Db, tag: string, subtype?: string | null): Promise<TagMapping | null> {
  const exact = subtype
    ? await db
        .select()
        .from(tagFacetMap)
        .where(and(eq(tagFacetMap.tag, tag), eq(tagFacetMap.subtype, subtype)))
        .limit(1)
    : [];
  const rows =
    exact.length > 0
      ? exact
      : await db
          .select()
          .from(tagFacetMap)
          .where(and(eq(tagFacetMap.tag, tag), isNull(tagFacetMap.subtype)))
          .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    facet: row.facet,
    abstractionLevel: row.abstractionLevel,
    writesAssertion: row.writesAssertion,
  };
}

/**
 * Save one tagged span.
 *
 * Throws before writing anything when the session is unknown, the tag has no
 * map row, or the quote does not equal the slice. Otherwise the annotation
 * and — when the map says so and the artifact has a subject — its assertion
 * are written in one transaction.
 */
export async function saveAnnotation(db: Db, input: SaveAnnotationInput): Promise<SaveAnnotationResult> {
  const sessions = await db
    .select()
    .from(readingSessions)
    .where(eq(readingSessions.id, input.sessionId))
    .limit(1);
  const reading = sessions[0];
  if (!reading) throw new UnknownSession(`no reading session ${input.sessionId}`);

  const canonical = await getCanonicalText(db, reading.textHash);
  if (canonical === null) throw new UnknownSession(`no artifact_texts row for ${reading.textHash}`);

  const slice = canonical.slice(input.start, input.end);
  if (slice !== input.selected) {
    throw new SliceMismatch(
      `the selection does not match the canonical text at [${input.start}, ${input.end}): ` +
        `${JSON.stringify(input.selected)} vs ${JSON.stringify(slice)}`,
    );
  }
  if (slice.length === 0) throw new SliceMismatch("an annotation cannot be empty");

  const mapping = await tagMapping(db, input.tag, input.subtype);
  if (!mapping) throw new UnknownTag(`no tag_facet_map row for ${input.tag}`);

  const prefix = canonical.slice(Math.max(0, input.start - CONTEXT), input.start);
  const suffix = canonical.slice(input.end, input.end + CONTEXT);
  const subject = await subjectOf(db, reading.artifactId);

  return db.transaction(async (tx) => {
    const scoped = tx as unknown as Db;
    const [annotation] = await tx
      .insert(annotations)
      .values({
        sessionId: reading.id,
        textHash: reading.textHash,
        startOff: input.start,
        endOff: input.end,
        quote: slice,
        prefix,
        suffix,
        tag: input.tag,
        mechanismSubtype: input.subtype ?? null,
        note: input.note ?? null,
      })
      .returning();

    if (!mapping.writesAssertion) return { annotation, assertionId: null, skipped: "map_says_no" as const };
    if (!subject) return { annotation, assertionId: null, skipped: "no_subject" as const };

    const own = subject.subjectType === "paper" || subject.subjectId === reading.readerId;
    const confidence: Confidence = own ? "confirmed" : "corroborated";
    const provenance = {
      kind: "annotation",
      annotation_id: annotation.id,
      session_id: reading.id,
      reader_id: reading.readerId,
      text_hash: reading.textHash,
      ...(own ? {} : { corroborated_by: annotation.id }),
    } as Provenance;

    const written = await insertAssertion(scoped, {
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
      facet: mapping.facet,
      abstractionLevel: mapping.abstractionLevel,
      text: slice,
      sourceType: "annotation",
      sourceArtifactId: reading.artifactId,
      textHash: reading.textHash,
      startOff: input.start,
      endOff: input.end,
      quote: slice,
      provenance,
      confidence,
    });

    const [linked] = await tx
      .update(annotations)
      .set({ assertionId: written.id })
      .where(eq(annotations.id, annotation.id))
      .returning();

    return { annotation: linked, assertionId: written.id };
  });
}

/**
 * Delete an annotation and retire what it filed.
 *
 * The annotation is UI state and is hard-deleted; the assertion is the
 * record and is never deleted. It is marked `superseded` with no successor —
 * the contract's `supersede` takes a replacement row and a deletion has
 * none — and `provenance.superseded_reason` says why.
 *
 * Refused while a reconciliation cites it: that row compared this exact
 * human span with a model's, and removing one side would leave a comparison
 * of nothing.
 */
export async function deleteAnnotation(db: Db, annotationId: string): Promise<{ assertionId: string | null }> {
  const cited = await db
    .select({ id: reconciliations.id })
    .from(reconciliations)
    .where(eq(reconciliations.humanAnnotationId, annotationId));
  if (cited.length > 0) throw new AnnotationReferenced(cited.map((r) => r.id));

  const rows = await db.select().from(annotations).where(eq(annotations.id, annotationId)).limit(1);
  const annotation = rows[0];
  if (!annotation) return { assertionId: null };

  return db.transaction(async (tx) => {
    await tx.delete(annotations).where(eq(annotations.id, annotationId));
    if (annotation.assertionId) {
      await tx
        .update(assertions)
        .set({
          status: "superseded",
          // `||` rather than a replacement: the annotation id, the reader
          // and the session are still how this row is read.
          provenance: sql`${assertions.provenance} || ${JSON.stringify({
            superseded_reason: "annotation_deleted",
          })}::jsonb`,
        })
        .where(and(eq(assertions.id, annotation.assertionId), eq(assertions.status, "active")));
    }
    return { assertionId: annotation.assertionId };
  });
}
