/** `npm run bench -- final` — the held-out fold, once per prompt version.
 *
 * The promise "frozen for that version" is made mechanical here rather than
 * remembered: before anything runs, the results file is read for a row at
 * the current `prompt_version` and model, and a second run is refused with
 * the date of the first. There is no flag to override it. The fold itself
 * is a function of each text's hash, so nothing can be moved into or out of
 * it either.
 *
 * It prints `HELD-OUT FOLD READ` before its number so a reader of the log
 * knows what was spent. */
import { existsSync, readFileSync } from "node:fs";
import { and, desc, eq } from "drizzle-orm";
import { getDb, type Db } from "@/db/client";
import { extractionRuns } from "@/db/schema";
import { appendResult, resultsFile } from "./results";
import { ensureHeader, report, scoreGold } from "./gold";

const VARIANT = "abstract";

const FINAL_HEADER = [
  "# Bench results — final",
  "",
  "Append-only. One row per run; a row is never edited after it is written.",
  "`tokens: unknown` means the run recorded no usage — it does not mean the",
  "run was free.",
  "",
  "**Fold 0. One row per prompt version, ever.** A second run at a version",
  "already listed below is refused. If the number here is worse than `gold`,",
  "that gap is the measurement — it is what the prompt loop bought itself by",
  "reading folds 1–4 many times.",
  "",
].join("\n");

/** Whether a row for this fingerprint is already on the record. The writer
 *  shortens a version to twelve characters, so the file is searched the
 *  same way. */
export function alreadyRun(promptVersion: string, model: string, file = resultsFile("final")): string | null {
  if (!existsSync(file)) return null;
  const short = promptVersion.slice(0, 12);
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.startsWith("|") || !line.includes(short)) continue;
    if (model && !line.includes(model)) continue;
    return line.trim();
  }
  return null;
}

export async function run(ctx: { args: string[]; db?: Db }): Promise<void> {
  const db = ctx.db ?? (await getDb());

  const [newest] = await db
    .select()
    .from(extractionRuns)
    .where(and(eq(extractionRuns.variant, VARIANT), eq(extractionRuns.status, "ok")))
    .orderBy(desc(extractionRuns.createdAt))
    .limit(1);

  if (!newest) {
    console.log("no `abstract` runs to score");
    console.log("0");
    return;
  }

  const standing = alreadyRun(newest.promptVersion, newest.model);
  if (standing) {
    console.error(
      `refused: fold 0 has already been read at prompt version ${newest.promptVersion.slice(0, 12)} ` +
        `on ${newest.model}.\n  ${standing}\nEdit the prompt, or read gold instead.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log("HELD-OUT FOLD READ");
  const scores = await scoreGold(db, { heldOut: true });
  if (scores.length === 0) {
    console.log("no annotated artifacts in fold 0 — nothing was spent");
    console.log("0");
    return;
  }

  const summary = report(scores);
  console.log(
    `n = ${summary.n} (${summary.completeN} complete) · precision ${summary.precision.toFixed(3)} · ` +
      `recall ${summary.recall === null ? "n/a" : summary.recall.toFixed(3)}`,
  );

  ensureHeader("final", FINAL_HEADER);
  appendResult({
    bench: "final",
    headline: summary.headline.toFixed(3),
    n: summary.n,
    ci: summary.ci,
    promptVersion: newest.promptVersion,
    coreVersion: newest.coreVersion,
    model: newest.model,
    tokens: null,
    extra:
      `token F1 p ${summary.tokenF1.purpose.toFixed(2)} / m ${summary.tokenF1.mechanism.toFixed(2)}; ` +
      `span F1 p ${summary.spanF1.purpose.toFixed(2)} / m ${summary.spanF1.mechanism.toFixed(2)}; ` +
      `HELD-OUT`,
  });

  console.log(summary.headline.toFixed(3));
}
