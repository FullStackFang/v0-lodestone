/** "Did last time's paper help?"
 *
 * Asked once, at the start of the next sitting, about the papers the reader
 * actually opened in the one before. Skipping is an answer of a kind — the
 * ask is scoped to the *previous* session, so a skipped paper is never
 * raised again and the follow-up cannot become a queue.
 *
 * The answer is a second judgment on the same `match_results` row, which is
 * what makes `requested → helped` and `requested → not_helpful` comparable
 * later. */
import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { document, judgments, matchResults, readingSessions } from "@/db/schema";
import { recordJudgment } from "../ledger";
import type { EdgeType, Verdict } from "../schema";

export interface Followup {
  matchResultId: string;
  judgmentId: string;
  edgeType: EdgeType;
  rank: number;
  queryAssertionId: string;
  candidateSubjectId: string;
  candidateAssertionIds: string[];
  title: string;
}

/** The reader's session before this one, whatever became of it. */
export async function previousSession(db: Db, readerId: string, currentSessionId: string) {
  const rows = await db
    .select()
    .from(readingSessions)
    .where(and(eq(readingSessions.readerId, readerId), ne(readingSessions.id, currentSessionId)))
    .orderBy(desc(readingSessions.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Papers requested in the previous sitting and not yet followed up.
 *
 * Empty for a first session, and empty again the moment the reader moves on
 * — the question belongs to one sitting only.
 */
export async function pendingFollowups(
  db: Db,
  readerId: string,
  currentSessionId: string,
): Promise<Followup[]> {
  const previous = await previousSession(db, readerId, currentSessionId);
  if (!previous) return [];

  const asked = await db
    .select({ matchResultId: judgments.matchResultId })
    .from(judgments)
    .where(
      and(
        eq(judgments.readerId, readerId),
        sql`${judgments.verdict} in ('helped', 'not_helpful')`,
      ),
    );
  const answered = new Set(asked.map((row) => row.matchResultId));

  const rows = await db
    .select({ judgment: judgments, title: document.title })
    .from(judgments)
    // `subject_id` is text — a person id, a card id and an artifact id all
    // live in it, and no one column type holds all three. The cast goes on
    // the uuid side: casting the other way would throw on a subject that is
    // not a uuid at all.
    .leftJoin(document, sql`${document.id}::text = ${judgments.candidateSubjectId}`)
    .where(
      and(
        eq(judgments.readerId, readerId),
        eq(judgments.verdict, "requested"),
        sql`${judgments.context} ->> 'session_id' = ${previous.id}`,
      ),
    )
    .orderBy(desc(judgments.createdAt));

  return rows
    .filter((row) => !answered.has(row.judgment.matchResultId))
    .map((row) => ({
      matchResultId: row.judgment.matchResultId,
      judgmentId: row.judgment.id,
      edgeType: row.judgment.edgeType,
      rank: row.judgment.rank,
      queryAssertionId: row.judgment.queryAssertionId,
      candidateSubjectId: row.judgment.candidateSubjectId,
      candidateAssertionIds: row.judgment.candidateAssertionIds,
      title: row.title ?? "a paper",
    }));
}

/** The second judgment, on the row the first one was about. */
export async function recordFollowup(
  db: Db,
  readerId: string,
  followup: Pick<
    Followup,
    "matchResultId" | "edgeType" | "rank" | "queryAssertionId" | "candidateSubjectId" | "candidateAssertionIds"
  >,
  verdict: Extract<Verdict, "helped" | "not_helpful">,
) {
  return recordJudgment(db, {
    readerId,
    edgeType: followup.edgeType,
    queryAssertionId: followup.queryAssertionId,
    candidateSubjectId: followup.candidateSubjectId,
    candidateAssertionIds: followup.candidateAssertionIds,
    matchResultId: followup.matchResultId,
    rank: followup.rank,
    verdict,
    context: { follow_up: true },
  });
}

/** Whether any result has been judged on an edge — until one has, the
 *  ordering is arbitrary and the card says so. */
export async function hasJudgments(db: Db, edgeType: EdgeType): Promise<boolean> {
  const rows = await db
    .select({ id: judgments.id })
    .from(judgments)
    .where(and(eq(judgments.edgeType, edgeType), isNotNull(judgments.id)))
    .limit(1);
  return rows.length > 0;
}

/** The rows shown for a query subject on an edge, newest computation
 *  first. */
export async function shownResults(db: Db, edgeType: EdgeType, querySubjectId: string) {
  return db
    .select()
    .from(matchResults)
    .where(and(eq(matchResults.edgeType, edgeType), eq(matchResults.querySubjectId, querySubjectId)))
    .orderBy(matchResults.rank);
}
