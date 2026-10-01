/** Introductions exchange contacts only after both participants consent. */
import { and, asc, desc, eq, inArray, ne, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import { founderIntroductions, type FounderIntroduction } from "@/db/matching-schema";
import { assertions, judgments, matchResults, person, type JudgmentRow, type MatchResultRow } from "@/db/schema";
import { NOT_STATED, recordJudgment } from "../ledger";
import type { Verdict } from "../schema";
import { compatiblePair, matchingStateHash } from "./preferences";
import { ideasOf } from "./subjects";
import { isActiveMember, lockActiveMembership } from "@/pilot/membership";

async function ownedResult(db: Db, resultId: string, readerId: string): Promise<MatchResultRow> {
  const [result] = await db.select().from(matchResults).where(eq(matchResults.id, resultId)).limit(1);
  if (!result || result.edgeType !== "cofounder" || result.querySubjectType !== "person" ||
    result.querySubjectId !== readerId || result.candidateSubjectId === readerId) {
    throw new Error("Not your match result.");
  }
  return result;
}

async function queryAssertionFor(db: Db, result: MatchResultRow): Promise<string | null> {
  const subjectIds = [result.querySubjectId, ...(await ideasOf(db, result.querySubjectId))];
  const contributors = (result.components as { contributors?: Record<string, { query: string }> }).contributors ?? {};
  const ids = Object.values(contributors).map((c) => c.query);
  if (ids.length) {
    const [row] = await db.select().from(assertions).where(and(
      inArray(assertions.id, ids), inArray(assertions.subjectId, subjectIds),
    )).limit(1);
    if (row) return row.id;
  }
  for (const facets of [["purpose"], ["mechanism_sought"], []] as const) {
    const [row] = await db.select().from(assertions).where(and(
      inArray(assertions.subjectId, subjectIds), eq(assertions.status, "active"),
      facets.length ? inArray(assertions.facet, [...facets]) : undefined, ne(assertions.text, NOT_STATED),
    )).limit(1);
    if (row) return row.id;
  }
  return null;
}

async function write(db: Db, result: MatchResultRow, readerId: string, verdict: Verdict,
  context: Record<string, unknown> = {}): Promise<JudgmentRow> {
  const queryAssertionId = await queryAssertionFor(db, result);
  if (!queryAssertionId) throw new Error("This match has no stated assertion to judge.");
  const contributors = (result.components as { contributors?: Record<string, { candidate: string }> }).contributors ?? {};
  return recordJudgment(db, {
    readerId, edgeType: result.edgeType, queryAssertionId,
    candidateSubjectId: result.candidateSubjectId,
    candidateAssertionIds: [...new Set(Object.values(contributors).map((c) => c.candidate))],
    matchResultId: result.id, rank: result.rank, verdict,
    context: { score: result.score, components: result.components, prompt_version: result.promptVersion, ...context },
  });
}

export interface IntroductionResult {
  introduction: FounderIntroduction;
  judgment: JudgmentRow;
}

export async function requestIntroduction(db: Db, matchResultId: string, readerId: string): Promise<IntroductionResult> {
  return db.transaction(async (tx) => {
    const result = await ownedResult(tx, matchResultId, readerId);
    // Serialize reciprocal requests in a stable order as well as exact replays.
    for (const personId of [readerId, result.candidateSubjectId].sort()) {
      await lockActiveMembership(tx as unknown as Db, personId);
    }
    const existing = await tx.select().from(founderIntroductions).where(or(
      and(eq(founderIntroductions.requesterId, readerId), eq(founderIntroductions.recipientId, result.candidateSubjectId)),
      and(eq(founderIntroductions.requesterId, result.candidateSubjectId), eq(founderIntroductions.recipientId, readerId)),
    )).orderBy(desc(founderIntroductions.requestedAt));
    const reusable = existing.find((row) => row.status !== "cancelled");
    if (reusable) {
      const [judgment] = await tx.select().from(judgments).where(and(
        eq(judgments.matchResultId, reusable.matchResultId), eq(judgments.verdict, "requested"),
        eq(judgments.readerId, reusable.requesterId),
      )).limit(1);
      if (!judgment) throw new Error("Introduction record is incomplete.");
      return { introduction: reusable, judgment };
    }
    if (!(await compatiblePair(tx, readerId, result.candidateSubjectId))) {
      throw new Error("Both founders must opt in with compatible preferences.");
    }
    if (result.assertionSetHash !== await matchingStateHash(tx, readerId, result.candidateSubjectId)) {
      throw new Error("This match has changed. Refresh your matches before requesting.");
    }
    const [introduction] = await tx.insert(founderIntroductions).values({
      matchResultId, requesterId: readerId, recipientId: result.candidateSubjectId,
    }).returning();
    const judgment = await write(tx, result, readerId, "requested", { introduction_id: introduction.id });
    return { introduction, judgment };
  });
}

export async function respondIntroduction(db: Db, introductionId: string, readerId: string,
  decision: "accepted" | "declined"): Promise<FounderIntroduction> {
  if (decision !== "accepted" && decision !== "declined") throw new Error("Unknown introduction response.");
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(founderIntroductions)
      .where(eq(founderIntroductions.id, introductionId)).for("update");
    if (!row || row.recipientId !== readerId) throw new Error("Only the recipient may respond.");
    for (const personId of [row.requesterId, row.recipientId].sort()) {
      await lockActiveMembership(tx as unknown as Db, personId);
    }
    if (row.status !== "pending") {
      if (row.status === decision) return row;
      throw new Error("This introduction already has a different response.");
    }
    if (decision === "accepted" && !(await compatiblePair(tx, row.requesterId, row.recipientId))) {
      throw new Error("Both founders must still opt in with compatible preferences.");
    }
    const [updated] = await tx.update(founderIntroductions).set({ status: decision, respondedAt: new Date() })
      .where(eq(founderIntroductions.id, row.id)).returning();
    return updated;
  });
}

export async function introductionContact(db: Db, introductionId: string, readerId: string) {
  const [row] = await db.select().from(founderIntroductions).where(eq(founderIntroductions.id, introductionId));
  if (!row || row.requesterId !== readerId && row.recipientId !== readerId) throw new Error("Not your introduction.");
  if (row.status !== "accepted") return null;
  const [requesterActive, recipientActive] = await Promise.all([
    isActiveMember(db, row.requesterId),
    isActiveMember(db, row.recipientId),
  ]);
  if (!requesterActive || !recipientActive) return null;
  const otherId = row.requesterId === readerId ? row.recipientId : row.requesterId;
  const [contact] = await db.select({ name: person.name, email: person.email }).from(person).where(eq(person.id, otherId));
  return contact ?? null;
}

export async function introductionsFor(db: Db, readerId: string) {
  const rows = await db.select().from(founderIntroductions).where(or(
    eq(founderIntroductions.requesterId, readerId), eq(founderIntroductions.recipientId, readerId),
  )).orderBy(desc(founderIntroductions.requestedAt));
  return Promise.all(rows.map(async (row) => {
    const mine = row.requesterId === readerId;
    const [other] = await db.select({ name: person.name }).from(person)
      .where(eq(person.id, mine ? row.recipientId : row.requesterId));
    return { row, mine, otherName: other?.name ?? "A classmate", contact: await introductionContact(db, row.id, readerId) };
  }));
}

export async function dismiss(db: Db, matchResultId: string, readerId: string): Promise<JudgmentRow> {
  return db.transaction(async (tx) => {
    await lockActiveMembership(tx as unknown as Db, readerId);
    const result = await ownedResult(tx, matchResultId, readerId);
    await tx.select({ id: matchResults.id }).from(matchResults).where(eq(matchResults.id, result.id)).for("update");
    const [existing] = await tx.select().from(judgments).where(and(
      eq(judgments.matchResultId, result.id), eq(judgments.readerId, readerId), eq(judgments.verdict, "dismissed"),
    )).limit(1);
    return existing ?? write(tx, result, readerId, "dismissed");
  });
}

export async function recordFollowUp(db: Db, matchResultId: string, readerId: string,
  verdict: "helped" | "not_helpful"): Promise<JudgmentRow> {
  if (verdict !== "helped" && verdict !== "not_helpful") throw new Error("Unknown follow-up response.");
  return db.transaction(async (tx) => {
    await lockActiveMembership(tx as unknown as Db, readerId);
    const result = await ownedResult(tx, matchResultId, readerId);
    const [introduction] = await tx.select().from(founderIntroductions).where(and(
      eq(founderIntroductions.matchResultId, result.id), eq(founderIntroductions.requesterId, readerId),
      eq(founderIntroductions.status, "accepted"),
    )).for("update");
    if (!introduction) throw new Error("A follow-up requires an accepted introduction.");
    const [existing] = await tx.select().from(judgments).where(and(
      eq(judgments.matchResultId, result.id), eq(judgments.readerId, readerId),
      inArray(judgments.verdict, ["helped", "not_helpful"]),
    )).limit(1);
    if (existing) {
      if (existing.verdict !== verdict) throw new Error("This follow-up already has a different response.");
      return existing;
    }
    return write(tx, result, readerId, verdict, { introduction_id: introduction.id });
  });
}

export async function pendingFollowUps(db: Db, days = 7) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const accepted = await db.select().from(founderIntroductions).where(eq(founderIntroductions.status, "accepted"));
  const requested = await db.select().from(judgments).where(eq(judgments.verdict, "requested"));
  const answered = await db.select().from(judgments).where(inArray(judgments.verdict, ["helped", "not_helpful"]));
  return requested.filter((j) => accepted.some((i) => i.matchResultId === j.matchResultId &&
    i.requesterId === j.readerId && i.respondedAt && i.respondedAt <= cutoff) &&
    !answered.some((a) => a.matchResultId === j.matchResultId && a.readerId === j.readerId));
}
