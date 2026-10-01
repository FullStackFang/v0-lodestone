/** The card is the result.
 *
 * A score ranks; a mapping explains. What the founder sees is
 * "[what they state] ↔ [what you seek]", and the score is never
 * rendered — the mapping text is what stops a premature rejection.
 *
 * Cached on the contract's two-sided `assertion_set_hash`: a recompute over
 * two people who have not moved makes no model call. A rerank failure
 * leaves the score row without a card; it never drops the candidate.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { matchResults, person, type AssertionRow, type MatchResultRow } from "@/db/schema";
import { structured as realStructured } from "../model";
import type { EdgeType } from "../schema";
import type { QueryResult } from "./queries";
import { compatiblePair, matchingRows, matchingStateHash } from "./preferences";

export const RerankCard = z
  .object({
    mappings: z.array(z.object({ theirs: z.string().min(1), yours: z.string().min(1) })).min(1),
    verdict: z.enum(["generative", "critical"]),
    commitment: z.enum(["compatible", "incompatible", "unknown"]),
    why: z.string().min(1),
  })
  .strict();
export type RerankCard = z.infer<typeof RerankCard>;

const PROMPT = path.join(process.cwd(), "prompts", "harness", "rerank-founder.md");

function promptText(): { text: string; version: string } {
  const text = readFileSync(PROMPT, "utf8").replace(/\r\n/g, "\n");
  return { text, version: createHash("sha256").update(text, "utf8").digest("hex") };
}

/** Haiku by default: three calls per query person per recompute, and the
 *  card is a short piece of writing over a short list. */
function rerankModel(): string {
  return process.env.HARNESS_RERANK_MODEL?.trim() || "claude-haiku-4-5";
}

/** What the model is shown: the rows themselves, with the rung they stand
 *  on, because "shipped three iOS apps (repeated)" and the same line at
 *  `extracted` are different claims. */
function describe(rows: AssertionRow[]): string {
  return rows
    .filter((r) => r.text !== "not_stated")
    .map((r) => {
      const level = r.abstractionLevel ? `@${r.abstractionLevel}` : "";
      const evidence = r.evidenceType ? `, ${r.evidenceType}` : "";
      return `- [${r.facet}${level}] ${r.text} (${r.confidence}${evidence})`;
    })
    .join("\n");
}

/** A founder, whole: their own rows and every card of theirs. */
async function rowsFor(db: Db, personId: string): Promise<AssertionRow[]> {
  return matchingRows(db, personId);
}

export interface RerankDeps {
  structured?: typeof realStructured;
}

export interface PersistedResult {
  row: MatchResultRow;
  card: RerankCard | null;
  cached: boolean;
}

/**
 * Score row in, `match_results` row out — with a card when the model could
 * write one.
 *
 * The hash covers both sides, so a stale card is never served after either
 * founder has moved.
 */
export async function rerankAndPersist(
  db: Db,
  input: {
    edgeType: EdgeType;
    querySubjectType: "person" | "idea";
    querySubjectId: string;
    result: QueryResult;
    rank: number;
    skipModel?: boolean;
  },
  deps: RerankDeps = {},
): Promise<PersistedResult> {
  const structured = deps.structured ?? realStructured;
  if (!(await compatiblePair(db, input.querySubjectId, input.result.candidateSubjectId))) {
    throw new Error("Both founders must opt in with compatible preferences.");
  }
  const hash = await matchingStateHash(db, input.querySubjectId, input.result.candidateSubjectId);

  const [existing] = await db
    .select()
    .from(matchResults)
    .where(
      and(
        eq(matchResults.edgeType, input.edgeType),
        eq(matchResults.querySubjectId, input.querySubjectId),
        eq(matchResults.candidateSubjectId, input.result.candidateSubjectId),
        eq(matchResults.assertionSetHash, hash),
      ),
    )
    .orderBy(desc(matchResults.computedAt))
    .limit(1);
  if (existing?.card) return { row: existing, card: existing.card as RerankCard, cached: true };

  const components = {
    ...input.result.components,
    contributors: Object.fromEntries(
      input.result.contributions.map((c) => [c.family, { query: c.query, candidate: c.candidate }]),
    ),
  };

  let card: RerankCard | null = null;
  let promptVersion: string | null = null;

  if (!input.skipModel) {
    try {
      const [mine, theirs, names] = await Promise.all([
        rowsFor(db, input.querySubjectId),
        rowsFor(db, input.result.candidateSubjectId),
        db.select().from(person).where(eq(person.id, input.result.candidateSubjectId)).limit(1),
      ]);
      const prompt = promptText();
      promptVersion = prompt.version;
      const response = await structured(RerankCard, {
        system: prompt.text,
        prompt: [
          "READER",
          describe(mine),
          "",
          `CANDIDATE${names[0] ? ` — ${names[0].name}` : ""}`,
          describe(theirs),
        ].join("\n"),
        model: rerankModel(),
      });
      card = response.output;
    } catch {
      // A card is a nicety; the ranking is the result. The row lands
      // without one and the page says so.
      card = null;
    }
  }

  const [row] = await db
    .insert(matchResults)
    .values({
      edgeType: input.edgeType,
      querySubjectType: input.querySubjectType,
      querySubjectId: input.querySubjectId,
      candidateSubjectId: input.result.candidateSubjectId,
      score: input.result.score,
      rank: input.rank,
      components: components as never,
      card: card as never,
      promptVersion,
      assertionSetHash: hash,
    })
    .returning();

  return { row, card, cached: false };
}
