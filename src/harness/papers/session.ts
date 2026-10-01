/** Ending a sitting.
 *
 * Four things happen, in this order and only here: the session is stamped
 * ended, the exhaustive session's absence toggles become `not_stated` rows,
 * the session's annotations are reconciled against the model's assertions,
 * and its notes are classified — the ones that turn out to be questions
 * becoming the reader's own purposes.
 *
 * Leaving the page without ending is fine. An open session is simply open;
 * nothing downstream reads one as evidence of anything, and only a session
 * that ended in `exhaustive` mode is a complete observation. */
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { assertions, readingSessions } from "@/db/schema";
import { NOT_STATED, insertAssertion } from "../ledger";
import type { Facet, Provenance } from "../schema";
import { subjectOf } from "./annotate";
import { classifySessionNotes, type NoteClassification } from "./notes";
import { reconcileSession, type ReconciliationSummary } from "./reconcile";
import { stampEnded } from "./reading";

/** The facets a reader can mark absent. Purpose and mechanism are what the
 *  bench scores; constraint and evaluation are what an abstract most often
 *  leaves out. */
export const ABSENCE_FACETS: Facet[] = ["purpose", "mechanism", "constraint", "evaluation"];

export interface EndSessionResult {
  ended: boolean;
  absence: Facet[];
  reconciliation: ReconciliationSummary | null;
  notes: NoteClassification | null;
}

export interface EndSessionDeps {
  classify?: typeof classifySessionNotes;
}

/**
 * End a reading session.
 *
 * Idempotent by the stamp: a second submit finds the session already ended
 * and does nothing, so a double-clicked button cannot write two sets of
 * absence rows or reconcile twice.
 */
export async function endSession(
  db: Db,
  sessionId: string,
  absent: Facet[] = [],
  deps: EndSessionDeps = {},
): Promise<EndSessionResult> {
  const session = await stampEnded(db, sessionId);
  if (!session) return { ended: false, absence: [], reconciliation: null, notes: null };

  const absence =
    session.mode === "exhaustive" ? await writeAbsence(db, sessionId, absent) : [];
  const reconciliation = await reconcileSession(db, sessionId);
  const classify = deps.classify ?? classifySessionNotes;
  const notes = await classify(db, sessionId);

  return { ended: true, absence, reconciliation, notes };
}

/** One `not_stated` row per checked facet, on the artifact's subject.
 *  Skipped where an active one already stands — two exhaustive readings of
 *  the same abstract agree rather than double-count. */
async function writeAbsence(db: Db, sessionId: string, absent: Facet[]): Promise<Facet[]> {
  const wanted = ABSENCE_FACETS.filter((facet) => absent.includes(facet));
  if (wanted.length === 0) return [];

  const rows = await db.select().from(readingSessions).where(eq(readingSessions.id, sessionId)).limit(1);
  const session = rows[0];
  if (!session) return [];
  const subject = await subjectOf(db, session.artifactId);
  if (!subject) return [];

  const written: Facet[] = [];
  for (const facet of wanted) {
    const existing = await db
      .select({ id: assertions.id })
      .from(assertions)
      .where(
        and(
          eq(assertions.subjectId, subject.subjectId),
          eq(assertions.facet, facet),
          eq(assertions.text, NOT_STATED),
          eq(assertions.sourceType, "annotation"),
          eq(assertions.status, "active"),
        ),
      )
      .limit(1);
    if (existing[0]) continue;

    await insertAssertion(db, {
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
      facet,
      text: NOT_STATED,
      sourceType: "annotation",
      sourceArtifactId: session.artifactId,
      confidence: "confirmed",
      provenance: {
        kind: "document",
        document_id: session.artifactId,
        session_id: session.id,
        reader_id: session.readerId,
        text_hash: session.textHash,
      } as Provenance,
    });
    written.push(facet);
  }
  return written;
}
