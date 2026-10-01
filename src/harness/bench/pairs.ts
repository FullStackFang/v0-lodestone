/** `npm run bench -- pairs [--fit] [--assert]`
 *
 * The instrument the founder track is steered by. It runs the real query
 * over the seeded synthetic cohort and asks two questions of each labeled
 * pair: is the person who should be there in the top three (P@3), and how
 * far down is the first one (MRR). `should_not` counts the times the
 * ranking surfaced someone we said it must not.
 *
 * It refuses to print a number it cannot stand behind. Similarity needs
 * vectors, so with no embedding provider the run says so and writes no row:
 * a P@3 computed over null embeddings would be a measurement of nothing.
 *
 * `--fit` grids λ against the headline rung and prints the six cells. It
 * never writes `weights.ts`; a human reads the grid and does that.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { assertions, matchParams, person } from "@/db/schema";
import { query } from "@/harness/founder/queries";
import { COFOUNDER, HEADLINES, LAMBDA_GRID, type Weights } from "@/harness/founder/weights";
import { appendResult, resultsFile } from "./results";
import { bootstrapCI } from "./stats";
import type { BenchContext } from "./registry";
import type { EdgeType } from "../schema";

interface Pair {
  edge_type: EdgeType;
  query: string;
  should?: string[];
  should_not?: string[];
  note: string;
}

const TOP = 3;

export function loadPairs(): Pair[] {
  const file = path.join(process.cwd(), "evals", "harness", "founder", "pairs.json");
  return (JSON.parse(readFileSync(file, "utf8")) as { pairs: Pair[] }).pairs;
}

export interface EdgeScore {
  edgeType: string;
  n: number;
  p3: number;
  p3ci: [number, number];
  mrr: number;
  mrrci: [number, number];
  violations: number;
}

/** P@3 over a pair with k answers is the share of its `should` list that
 *  made the top three — a pair naming one person and getting them at rank 3
 *  scores 1, not 1/3. */
export function scorePair(ranked: string[], pair: Pair): { p3: number | null; rr: number | null; violations: number } {
  const top = ranked.slice(0, TOP);
  const should = pair.should ?? [];
  const violations = (pair.should_not ?? []).filter((id) => top.includes(id)).length;
  if (should.length === 0) return { p3: null, rr: null, violations };
  const hits = should.filter((id) => top.includes(id)).length;
  const at = ranked.findIndex((id) => should.includes(id));
  return { p3: hits / should.length, rr: at < 0 ? 0 : 1 / (at + 1), violations };
}

async function emailToPerson(db: Db): Promise<Map<string, string>> {
  const rows = await db.select().from(person);
  return new Map(rows.map((r) => [r.email, r.id]));
}

/** Every edge the file has pairs for, scored. `cofounder` is the only one
 *  the query implements; the others are reported as awaiting the gate. */
async function run(
  db: Db,
  weights: Weights,
  options: { edges?: EdgeType[] } = {},
): Promise<{ scores: EdgeScore[]; skipped: string[] }> {
  const pairs = loadPairs();
  const byEmail = await emailToPerson(db);
  const scores: EdgeScore[] = [];
  const skipped: string[] = [];

  const edges = options.edges ?? ([...new Set(pairs.map((p) => p.edge_type))] as EdgeType[]);
  for (const edgeType of edges) {
    const mine = pairs.filter((p) => p.edge_type === edgeType);
    if (mine.length === 0) continue;
    if (edgeType !== "cofounder") {
      // Two different reasons, and saying "the gate" for both was wrong.
      // `competitor` and `mentor` are written and deliberately unbuilt until
      // a hundred judgments exist to fit them against. The paper edges are
      // not gated on anything — they are the papers track's, they query a
      // different subject kind through `papers/analogy.ts`, and this bench
      // does not reach them yet.
      const gated = edgeType === "competitor" || edgeType === "mentor";
      skipped.push(
        `${edgeType} (${mine.length} pairs): ` +
          (gated
            ? "not built until the hundred-judgment gate"
            : "scored through `papers/analogy.ts`, which this bench does not call yet"),
      );
      continue;
    }

    const p3s: number[] = [];
    const rrs: number[] = [];
    let violations = 0;

    for (const pair of mine) {
      const personId = byEmail.get(pair.query);
      if (!personId) {
        skipped.push(`${pair.query}: not seeded`);
        continue;
      }
      const { results } = await query(db, edgeType, { personId }, 20, weights);
      const ranked = results.map((r) => r.candidateSubjectId);
      const wanted = { ...pair, should: pair.should?.map((e) => byEmail.get(e) ?? e), should_not: pair.should_not?.map((e) => byEmail.get(e) ?? e) };
      const scored = scorePair(ranked, wanted);
      if (scored.p3 !== null) p3s.push(scored.p3);
      if (scored.rr !== null) rrs.push(scored.rr);
      violations += scored.violations;
    }

    const p3 = bootstrapCI(p3s);
    const mrr = bootstrapCI(rrs);
    scores.push({
      edgeType,
      n: mine.length,
      p3: p3.mean,
      p3ci: p3.ci,
      mrr: mrr.mean,
      mrrci: mrr.ci,
      violations,
    });
  }

  return { scores, skipped };
}

/** Nothing embedded, nothing to measure. */
async function embeddedCount(db: Db): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(assertions)
    .where(sql`${assertions.embedding} is not null`);
  return count;
}

export async function pairsBench(db: Db, args: string[]): Promise<void> {
  const embedded = await embeddedCount(db);
  if (embedded === 0) {
    console.log(
      [
        "pairs: no embedded assertions in this database.",
        "Every similarity component would be null, so P@3 and MRR would be",
        "measurements of nothing. Set VOYAGE_API_KEY, re-seed, and run again.",
        "No row was written.",
      ].join("\n"),
    );
    process.exitCode = 2;
    return;
  }

  const [params] = await db.select().from(matchParams).where(eq(matchParams.edgeType, "cofounder"));

  if (args.includes("--fit")) {
    console.log("fit — mean MRR over the cofounder pairs\n");
    console.log("  λ      abstract   specific");
    let best = { lambda: 0, headline: "abstract" as "abstract" | "specific", mrr: -1 };
    for (const lambda of LAMBDA_GRID) {
      const cells: string[] = [];
      for (const headline of ["abstract", "specific"] as const) {
        await db.update(matchParams).set({ lambda }).where(eq(matchParams.edgeType, "cofounder"));
        const weights: Weights = { ...COFOUNDER, ...HEADLINES[headline] };
        const { scores } = await run(db, weights, { edges: ["cofounder"] });
        const mrr = scores[0]?.mrr ?? 0;
        cells.push(mrr.toFixed(3).padStart(8));
        if (mrr > best.mrr) best = { lambda, headline, mrr };
      }
      console.log(`  ${String(lambda).padEnd(6)}${cells.join("   ")}`);
    }
    // The grid moved `match_params`; put it back. The fit reports, it does
    // not decide.
    await db
      .update(matchParams)
      .set({ lambda: params?.lambda ?? 0.3 })
      .where(eq(matchParams.edgeType, "cofounder"));

    console.log(`\nbest: λ = ${best.lambda}, headline = ${best.headline} (MRR ${best.mrr.toFixed(3)})`);
    console.log("weights.ts is unchanged — copy the winner in by hand.");
    appendResult({
      bench: "pairs",
      headline: `fit: λ=${best.lambda} headline=${best.headline} MRR ${best.mrr.toFixed(3)}`,
      model: "none (no rerank in the fit)",
      tokens: null,
      extra: "grid 3×2 over λ and the headline rung; weights.ts untouched",
    });
    return;
  }

  // Read the last row before this run appends its own.
  const file = resultsFile("pairs");
  const previous = previousP3(existsSync(file) ? readFileSync(file, "utf8") : "");

  const { scores, skipped } = await run(db, COFOUNDER);
  for (const s of scores) {
    console.log(
      `${s.edgeType}: P@3 ${s.p3.toFixed(3)} [${s.p3ci[0].toFixed(3)}, ${s.p3ci[1].toFixed(3)}] · ` +
        `MRR ${s.mrr.toFixed(3)} · n ${s.n} · should_not in top 3: ${s.violations}`,
    );
  }
  for (const line of skipped) console.log(`  skipped: ${line}`);

  if (scores.length > 0) {
    const head = scores[0];
    appendResult({
      bench: "pairs",
      headline: `P@3 ${head.p3.toFixed(3)} (${head.edgeType})`,
      n: head.n,
      ci: head.p3ci,
      model: "no rerank in the scoring path",
      tokens: null,
      extra:
        `MRR ${head.mrr.toFixed(3)}; violations ${head.violations}; ` +
        `λ=${params?.lambda ?? "—"} μ=${params?.mu ?? "—"}; ` +
        `w=${JSON.stringify(COFOUNDER)}`,
    });
  }

  if (args.includes("--assert")) assertNoRegression(scores, previous);
}

/** The last P@3 recorded per edge, read back out of the results file. A
 *  regression is measured against what was written down, not against a
 *  number held in someone's head. */
export function previousP3(markdown: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of markdown.split("\n")) {
    const m = /P@3\s+([0-9.]+)\s+\(([a-z_]+)\)/.exec(line);
    if (m) out.set(m[2], Number(m[1]));
  }
  return out;
}

const TOLERANCE = 0.1;

function assertNoRegression(scores: EdgeScore[], previous: Map<string, number>): void {
  const dropped = scores.filter((s) => {
    const before = previous.get(s.edgeType);
    return before !== undefined && before - s.p3 > TOLERANCE;
  });
  if (dropped.length === 0) {
    console.log("--assert: no edge dropped more than 0.1 against the previous row.");
    return;
  }
  for (const s of dropped) {
    console.error(
      `--assert: ${s.edgeType} P@3 fell from ${previous.get(s.edgeType)!.toFixed(3)} to ${s.p3.toFixed(3)}`,
    );
  }
  process.exitCode = 1;
}

/** The registry loads this. */
export async function run_(ctx: BenchContext): Promise<void> {
  const db = ctx.db ?? (await (await import("@/db/client")).getDb());
  await pairsBench(db, ctx.args);
}

export { run_ as run };
