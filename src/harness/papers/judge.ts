/** A verdict on a card the reader was actually shown.
 *
 * `match_result_id` is required and is checked against the table: a
 * judgment about a result nobody was shown is not evidence of anything, and
 * the tuning data is only worth what its weakest row is worth. The query
 * assertion comes from the scorer's own contributor, so a judgment names
 * the question that produced the candidate rather than the subject in
 * general — the same paper can be right for one question and wrong for the
 * next. */
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { matchResults } from "@/db/schema";
import { recordJudgment } from "../ledger";
import type { Verdict } from "../schema";
import { familyRows } from "./attribute";

export class NoResult extends Error {}

export interface JudgeInput {
  matchResultId: string;
  readerId: string;
  verdict: Extract<Verdict, "requested" | "dismissed">;
  sessionId?: string | null;
  /** λ and μ at the time of the judgment, read by the caller: this module
   *  does not look at the parameters, it only records them. */
  parameters?: { lambda: number | null; mu: number | null };
}

export async function judgeResult(db: Db, input: JudgeInput) {
  if (!input.matchResultId) throw new NoResult("a judgment names the result it is about");
  const [result] = await db.select().from(matchResults).where(eq(matchResults.id, input.matchResultId));
  if (!result) throw new NoResult(`no match_results row ${input.matchResultId}`);

  const queryAssertionId = result.components?.contributors?.abs?.query;
  if (!queryAssertionId) throw new NoResult("the result names no query assertion to judge it against");

  const card = result.card as { source?: string } | null;
  return recordJudgment(db, {
    readerId: input.readerId,
    edgeType: result.edgeType,
    queryAssertionId,
    candidateSubjectId: result.candidateSubjectId,
    candidateAssertionIds: await familyRows(db, result.candidateSubjectId, "abs"),
    matchResultId: result.id,
    rank: result.rank,
    verdict: input.verdict,
    context: {
      session_id: input.sessionId ?? null,
      score: result.score,
      components: result.components,
      lambda: input.parameters?.lambda ?? null,
      mu: input.parameters?.mu ?? null,
      rerank_prompt_version: result.promptVersion,
      source: card?.source ?? null,
    },
  });
}
