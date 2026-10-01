/** Private founder inventory and consent-filtered matching views. */
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { assertions, judgments, matchResults, person, type AssertionRow, type JudgmentRow, type MatchResultRow } from "@/db/schema";
import { introductionsFor, pendingFollowUps } from "./intro";
import { compatiblePair, matchingRows, matchingStateHash, preferencesFor, type PreferenceInput } from "./preferences";
import { velocity } from "./score";
import { ideasOf } from "./subjects";

export interface DriftChain {
  entries: { id: string; text: string; at: Date; current: boolean }[];
}

export interface MeView {
  personId: string | null;
  name: string | null;
  rows: AssertionRow[];
  sharedRows: AssertionRow[];
  preferences: PreferenceInput;
  drift: DriftChain[];
  velocity: number | null;
  introductions: Awaited<ReturnType<typeof introductionsFor>>;
  followUps: { judgment: JudgmentRow; otherName: string | null }[];
}

export const FOLLOW_UP_DAYS = 7;
const byFacet = (rows: AssertionRow[], facet: string) => rows.filter((r) => r.facet === facet);
export const stated = (rows: AssertionRow[]) => rows.filter((r) => r.text !== "not_stated");
export const absences = (rows: AssertionRow[]) => rows.filter((r) => r.text === "not_stated");

export function inventory(view: Pick<MeView, "rows">) {
  const person = view.rows.filter((r) => r.subjectType === "person");
  const idea = view.rows.filter((r) => r.subjectType === "idea");
  return {
    commanded: byFacet(person, "mechanism_commanded"),
    sought: byFacet(person, "mechanism_sought"),
    evidence: [...byFacet(person, "evidence"), ...byFacet(idea, "evidence")],
    purposes: byFacet(idea, "purpose"),
    constraints: byFacet(person, "constraint"),
  };
}

export async function driftOf(db: Db, subjectIds: string[]): Promise<DriftChain[]> {
  if (!subjectIds.length) return [];
  const rows = await db.select().from(assertions).where(and(
    inArray(assertions.subjectId, subjectIds), eq(assertions.facet, "purpose"),
  ));
  const predecessorOf = new Map(rows.filter((r) => r.supersededBy).map((r) => [r.supersededBy!, r]));
  const chains: DriftChain[] = [];
  for (const head of rows.filter((r) => r.status === "active")) {
    const entries = [head];
    for (let at = predecessorOf.get(head.id); at; at = predecessorOf.get(at.id)) {
      entries.unshift(at);
      if (entries.length > 20) break;
    }
    if (entries.length < 2) continue;
    chains.push({ entries: entries.map((r, i) => ({ id: r.id, text: r.text, at: r.createdAt, current: i === entries.length - 1 })) });
  }
  return chains.sort((a, b) => b.entries.length - a.entries.length).slice(0, 3);
}

export async function meView(db: Db, personId: string | null): Promise<MeView> {
  if (!personId) return { personId: null, name: null, rows: [], sharedRows: [], drift: [], velocity: null,
    preferences: { discoverable: false, availability: "unavailable", intent: "cofounder" }, introductions: [], followUps: [] };
  const [me] = await db.select({ name: person.name }).from(person).where(eq(person.id, personId));
  const cardIds = await ideasOf(db, personId);
  const subjectIds = [personId, ...cardIds];
  const rows = await db.select().from(assertions).where(and(
    inArray(assertions.subjectId, subjectIds), eq(assertions.status, "active"),
  )).orderBy(desc(assertions.createdAt));
  const introductions = await introductionsFor(db, personId);
  const pending = (await pendingFollowUps(db, FOLLOW_UP_DAYS)).filter((j) => j.readerId === personId);
  return {
    personId, name: me?.name ?? null, rows, sharedRows: await matchingRows(db, personId),
    preferences: await preferencesFor(db, personId), drift: await driftOf(db, subjectIds),
    velocity: cardIds.length ? await velocity(db, cardIds[0]) : null, introductions,
    followUps: pending.map((judgment) => ({ judgment,
      otherName: introductions.find((i) => i.row.matchResultId === judgment.matchResultId)?.otherName ?? null })),
  };
}

/** Display exact stated pairs; similarity never implies a missing capability. */
export function matchRationale(row: MatchResultRow, mine: AssertionRow[], theirs: AssertionRow[]) {
  const contributors = (row.components as { contributors?: Record<string, { query: string; candidate: string }> }).contributors ?? {};
  const complementary: { need: string; capability: string }[] = [];
  const sharedIdeas: { yours: string; theirs: string }[] = [];
  for (const pair of Object.values(contributors)) {
    const a = mine.find((r) => r.id === pair.query);
    const b = theirs.find((r) => r.id === pair.candidate);
    if (!a || !b || a.text === "not_stated" || b.text === "not_stated") continue;
    if (a.facet === "mechanism_sought" && b.facet === "mechanism_commanded") {
      complementary.push({ need: a.text, capability: b.text });
    } else if (a.facet === "purpose" && b.facet === "purpose") {
      sharedIdeas.push({ yours: a.text, theirs: b.text });
    }
  }
  return { complementary, sharedIdeas };
}

export async function matchesFor(db: Db, personId: string) {
  const mine = await preferencesFor(db, personId);
  if (!mine.discoverable || mine.availability === "unavailable") return [];
  const rows = await db.select().from(matchResults).where(and(
    eq(matchResults.querySubjectId, personId), eq(matchResults.querySubjectType, "person"), eq(matchResults.edgeType, "cofounder"),
  )).orderBy(desc(matchResults.computedAt));
  const seen = new Set<string>();
  const current: MatchResultRow[] = [];
  for (const row of rows) {
    if (seen.has(row.candidateSubjectId)) continue;
    seen.add(row.candidateSubjectId);
    if (!(await compatiblePair(db, personId, row.candidateSubjectId))) continue;
    if (row.assertionSetHash !== await matchingStateHash(db, personId, row.candidateSubjectId)) continue;
    current.push(row);
  }
  const acted = current.length ? await db.select().from(judgments).where(and(
    eq(judgments.readerId, personId), inArray(judgments.matchResultId, current.map((r) => r.id)),
  )) : [];
  const top = current.filter((r) => !acted.some((j) => j.matchResultId === r.id && j.verdict === "dismissed"))
    .sort((a, b) => a.rank - b.rank).slice(0, 3);
  const introductions = await introductionsFor(db, personId);
  const myRows = await matchingRows(db, personId);
  return Promise.all(top.map(async (row) => {
    const [candidate] = await db.select({ name: person.name }).from(person).where(eq(person.id, row.candidateSubjectId));
    return { row, name: candidate?.name ?? "A classmate",
      preferences: await preferencesFor(db, row.candidateSubjectId),
      rationale: matchRationale(row, myRows, await matchingRows(db, row.candidateSubjectId)),
      introduction: introductions.find((i) => i.row.requesterId === row.candidateSubjectId || i.row.recipientId === row.candidateSubjectId) ?? null,
    };
  }));
}

export async function markShown(db: Db, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db.update(matchResults).set({ shownAt: sql`now()` })
    .where(and(inArray(matchResults.id, ids), isNull(matchResults.shownAt)));
}
