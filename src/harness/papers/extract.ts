/** Running the `abstract` variant over a paper, and the ladder after it.
 *
 * Both calls are the contract's. This file supplies the subject — a paper's
 * assertions are about the paper — and nothing else. The ladder is a run of
 * its own, so `abstract` and `core` rungs carry their own `prompt_version`
 * and an edit to `ladder.md` produces new rungs without touching the
 * `specific` rows they were lifted from. */
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { artifactTexts, extractionRuns, type ExtractionRunRow } from "@/db/schema";
import { extract, runModel, type ExtractDeps } from "../extract/core";
import { ladder } from "../extract/ladder";
import { assembleExtractPrompt } from "../extract/prompt";
import type { Provenance } from "../schema";

export const VARIANT = "abstract";

export interface ExtractPaperResult {
  textHash: string;
  run: ExtractionRunRow;
  ladderRun: ExtractionRunRow | null;
  /** True when the run was already on the record at this prompt version. */
  cached: boolean;
}

/** The artifact a canonical text belongs to. */
export async function artifactOf(db: Db, textHash: string): Promise<string | null> {
  const rows = await db
    .select({ artifactId: artifactTexts.artifactId })
    .from(artifactTexts)
    .where(eq(artifactTexts.textHash, textHash))
    .limit(1);
  return rows[0]?.artifactId ?? null;
}

/** The newest run for a text at the current prompt version and model. */
export async function newestRun(
  db: Db,
  textHash: string,
  variant = VARIANT,
): Promise<ExtractionRunRow | null> {
  const prompt = assembleExtractPrompt(variant);
  const rows = await db
    .select()
    .from(extractionRuns)
    .where(
      and(
        eq(extractionRuns.textHash, textHash),
        eq(extractionRuns.variant, variant),
        eq(extractionRuns.promptVersion, prompt.promptVersion),
        eq(extractionRuns.model, runModel()),
      ),
    )
    .orderBy(desc(extractionRuns.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Extract one abstract, then ladder its purposes.
 *
 * A text whose newest run is `ok` at this prompt version is not re-run
 * unless `force` says so; a `failed` one is retried at the next attempt,
 * which is the contract's own rule and needs nothing here.
 */
export async function extractPaper(
  db: Db,
  textHash: string,
  options: { force?: boolean; variant?: string } = {},
  deps: ExtractDeps = {},
): Promise<ExtractPaperResult> {
  const variant = options.variant ?? VARIANT;
  const artifactId = await artifactOf(db, textHash);
  if (!artifactId) throw new Error(`no artifact_texts row for ${textHash}`);

  const before = await newestRun(db, textHash, variant);
  const cached = !options.force && before?.status === "ok";

  const run = await extract(
    db,
    {
      textHash,
      variant,
      subjects: { paper: artifactId },
      sourceType: "abstract",
      sourceArtifactId: artifactId,
      provenance: { kind: "document", document_id: artifactId } as Provenance,
      force: options.force,
    },
    deps,
  );

  const ladderRun = run.status === "ok" ? await ladder(db, run.id, deps) : null;
  return { textHash, run, ladderRun, cached };
}

/** One sentence about what generalizes, off the run that produced it.
 *  Never an assertion — no quote could anchor it. */
export function transferableInsight(run: ExtractionRunRow | null | undefined): string | null {
  const derived = run?.derived as { transferable_insight?: unknown } | null | undefined;
  const value = derived?.transferable_insight;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export interface RunCost {
  tokens: number | null;
  cost: string | null;
}

/** Tokens are the headline; cost is corroboration. A run with no usage
 *  recorded reads as unknown, never as free. */
export function costOf(run: ExtractionRunRow | null | undefined): RunCost {
  const usage = (run?.usage ?? null) as Record<string, unknown> | null;
  if (!usage) return { tokens: null, cost: null };
  const numbers = ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"]
    .map((key) => usage[key])
    .filter((value): value is number => typeof value === "number");
  const cost = usage.total_cost_usd ?? usage.cost_usd;
  return {
    tokens: numbers.length === 0 ? null : numbers.reduce((n, v) => n + v, 0),
    cost: typeof cost === "number" ? `$${cost.toFixed(4)}` : null,
  };
}

/** Add two runs' usage for a batch total, keeping `unknown` infectious in
 *  neither direction: a known part still counts. */
export function addCost(a: RunCost, b: RunCost): RunCost {
  const tokens = a.tokens === null && b.tokens === null ? null : (a.tokens ?? 0) + (b.tokens ?? 0);
  const dollars = (text: string | null) => (text === null ? null : Number(text.replace("$", "")));
  const ac = dollars(a.cost);
  const bc = dollars(b.cost);
  const cost = ac === null && bc === null ? null : `$${((ac ?? 0) + (bc ?? 0)).toFixed(4)}`;
  return { tokens, cost };
}
