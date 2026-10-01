/** What a sitting produced, computed once and then read.
 *
 * The cards are written when the session ends, not when the screen renders:
 * a rerank call per candidate on every page view would pay for the same
 * card twice and write a second exposure for a paper the reader has already
 * been shown. */
import { and, desc, eq, gte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { matchResults, readingSessions, reconciliations } from "@/db/schema";
import type { SubjectRef } from "../match/bandpass";
import type { EdgeType, Relation } from "../schema";
import { analogies } from "./analogy";
import { familyRows } from "./attribute";
import { priorArt } from "./priorArt";
import { paperSummary, rerankAndShow, showWithoutRerank, type PaperCard, type RerankDeps, type ShownResult } from "./rerank";

const ANALOGY_K = 5;
const PRIOR_ART_K = 3;

/** Run both queries for the reader and record every card shown. */
export async function computeSessionCards(
  db: Db,
  sessionId: string,
  deps: RerankDeps = {},
): Promise<{ analogies: ShownResult[]; priorArt: ShownResult[] } | null> {
  const [session] = await db.select().from(readingSessions).where(eq(readingSessions.id, sessionId)).limit(1);
  if (!session) return null;

  const query: SubjectRef = { subjectType: "person", subjectId: session.readerId };
  const analogyResults = await analogies(db, query, { k: ANALOGY_K });
  const shown = await rerankAndShow(
    db,
    { edgeType: "paper_analogy", query, results: analogyResults, sessionId },
    deps,
  );

  const priorResults = await priorArt(db, query, { k: PRIOR_ART_K });
  const prior = await showWithoutRerank(db, { edgeType: "prior_art", query, results: priorResults });

  return { analogies: shown, priorArt: prior };
}

export interface SessionSummary {
  sessionId: string;
  mode: string;
  artifactId: string;
  counts: Record<Relation, number>;
  analogies: ShownResult[];
  priorArt: ShownResult[];
}

/** Everything the end screen shows, read back from rows. */
export async function sessionSummary(db: Db, sessionId: string): Promise<SessionSummary | null> {
  const [session] = await db.select().from(readingSessions).where(eq(readingSessions.id, sessionId)).limit(1);
  if (!session) return null;

  const rows = await db.select().from(reconciliations).where(eq(reconciliations.sessionId, sessionId));
  const counts: Record<Relation, number> = { match: 0, boundary: 0, conflict: 0, miss: 0 };
  for (const row of rows) counts[row.relation] += 1;

  const since = session.endedAt ?? session.startedAt;
  const [analogyRows, priorRows] = await Promise.all([
    shownSince(db, "paper_analogy", session.readerId, since),
    shownSince(db, "prior_art", session.readerId, since),
  ]);

  return {
    sessionId,
    mode: session.mode,
    artifactId: session.artifactId,
    counts,
    analogies: analogyRows,
    priorArt: priorRows,
  };
}

async function shownSince(
  db: Db,
  edgeType: EdgeType,
  readerId: string,
  since: Date,
): Promise<ShownResult[]> {
  const rows = await db
    .select()
    .from(matchResults)
    .where(
      and(
        eq(matchResults.edgeType, edgeType),
        eq(matchResults.querySubjectId, readerId),
        gte(matchResults.computedAt, since),
      ),
    )
    .orderBy(matchResults.rank, desc(matchResults.computedAt));

  const seen = new Set<string>();
  const out: ShownResult[] = [];
  for (const row of rows) {
    if (seen.has(row.candidateSubjectId)) continue;
    seen.add(row.candidateSubjectId);
    const card = row.card as (PaperCard & { source?: string }) | null;
    out.push({
      matchResultId: row.id,
      rank: row.rank,
      score: row.score,
      source: (card?.source as ShownResult["source"]) ?? "question",
      paper: await paperSummary(db, row.candidateSubjectId),
      card: card ? { mapping: card.mapping, verdict: card.verdict, why: card.why } : null,
      // The scorer named the pair that produced `sim_abs`; the candidate
      // side of a judgment is looked up from it rather than stored twice.
      queryAssertionId: row.components?.contributors?.abs?.query ?? null,
      candidateAssertionIds: await familyRows(db, row.candidateSubjectId, "abs"),
      components: row.components,
    });
  }
  return out;
}
