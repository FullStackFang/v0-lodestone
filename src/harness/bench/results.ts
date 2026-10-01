/** One append-only results file per bench.
 *
 * Both tracks would otherwise append to one file under the same dated
 * heading, which is a merge conflict every time two benches run on one day.
 * One file per bench removes it, and nothing here ever rewrites a row: a
 * result that moved after the fact is not a result. */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const RESULTS_DIR = path.join(process.cwd(), "evals", "harness", "results");

export interface BenchResult {
  bench: string;
  /** The number this run is about, already formatted. */
  headline: string;
  /** Sample size, when the headline is a mean over items. */
  n?: number;
  /** The 95% interval that goes with `n`. Required when `n` is given: a
   *  mean over ten items without one is a number that reads as precise. */
  ci?: [number, number];
  promptVersion?: string;
  coreVersion?: string;
  model?: string;
  /** Model tokens. Absent reads as `unknown`, never as zero. */
  tokens?: number | null;
  cost?: string | null;
  extra?: string;
}

/** Prompt fingerprints are long and only the first bytes are ever compared. */
const short = (hash?: string) => (hash ? hash.slice(0, 12) : "—");

const today = () => new Date().toISOString().slice(0, 10);

function header(bench: string): string {
  return [
    `# Bench results — ${bench}`,
    "",
    "Append-only. One row per run; a row is never edited after it is written.",
    "`tokens: unknown` means the run recorded no usage — it does not mean the",
    "run was free.",
    "",
  ].join("\n");
}

const COLUMNS = "| headline | n | ci95 | prompt_version | core_version | model | tokens | cost | notes |";
const RULE = "| --- | --- | --- | --- | --- | --- | --- | --- | --- |";

export function resultsFile(bench: string): string {
  return path.join(RESULTS_DIR, `${bench}.md`);
}

/** Append one row, creating the file and today's section as needed. */
export function appendResult(result: BenchResult, dir = RESULTS_DIR): string {
  if (result.n != null && result.ci == null) {
    throw new Error(`bench ${result.bench}: a headline with n = ${result.n} must carry a 95% interval`);
  }
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${result.bench}.md`);
  const heading = `## ${today()}`;

  if (!existsSync(file)) writeFileSync(file, header(result.bench), "utf8");

  const existing = readFileSync(file, "utf8");
  const parts: string[] = [];
  if (!existing.includes(`\n${heading}\n`) && !existing.startsWith(`${heading}\n`)) {
    parts.push(`\n${heading}\n\n${COLUMNS}\n${RULE}\n`);
  }

  const ci = result.ci ? `[${result.ci[0].toFixed(3)}, ${result.ci[1].toFixed(3)}]` : "—";
  const tokens = result.tokens == null ? "unknown" : String(result.tokens);
  parts.push(
    `| ${result.headline} | ${result.n ?? "—"} | ${ci} | ${short(result.promptVersion)} | ` +
      `${short(result.coreVersion)} | ${result.model ?? "—"} | ${tokens} | ${result.cost ?? "unknown"} | ` +
      `${result.extra ?? ""} |\n`,
  );

  appendFileSync(file, parts.join(""), "utf8");
  return file;
}
