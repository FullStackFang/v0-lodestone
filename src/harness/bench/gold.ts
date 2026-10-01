/** `npm run bench -- gold` — the headline.
 *
 * Gold is what a person marked while reading, in our own genre, with exact
 * offsets. Folds 1–4 only; fold 0 belongs to `final` and no argument here
 * can reach it.
 *
 * Two asymmetries carry the honesty of this number. Recall is reported only
 * over artifacts with a *complete* session — exhaustive and ended — because
 * a casual reading that did not mark something is not evidence that it is
 * not there. And a model assertion a human highlight superseded still
 * counts as the run's prediction: reconciliation retires the row, it does
 * not retract the find. */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import { getDb, type Db } from "@/db/client";
import { artifactTexts, assertions, extractionRuns } from "@/db/schema";
import { NOT_STATED } from "../ledger";
import type { Facet } from "../schema";
import { completeArtifacts } from "../papers/reading";
import { isTraining } from "./fold";
import { RESULTS_DIR, appendResult } from "./results";
import { bootstrap, classOf, score, type LabelledSpan, type Score } from "./tokens";

const VARIANT = "abstract";

/** The reader who produces the gold is the reader who edits the prompt.
 *  The fold is the only wall between them, and a results file that does not
 *  say so is a number without its caveat. */
const GOLD_HEADER = [
  "# Bench results — gold",
  "",
  "Append-only. One row per run; a row is never edited after it is written.",
  "`tokens: unknown` means the run recorded no usage — it does not mean the",
  "run was free.",
  "",
  "**The reader who produces this gold is the person who edits the prompt it",
  "scores.** Folds 1–4 are read here; fold 0 is held out for `final`, which",
  "runs once per prompt version. That separation is the only thing standing",
  "between this number and the reader's memory of the abstracts.",
  "",
  "`recall` is reported only over artifacts with a complete session —",
  "exhaustive and ended. Where every session was casual the artifact",
  "contributes to precision alone.",
  "",
].join("\n");

export interface ArtifactScore {
  artifactId: string;
  textHash: string;
  complete: boolean;
  score: Score;
  notStated: { hits: number; misses: number; falsePositives: number };
}

interface GoldOptions {
  /** Fold 0 instead of folds 1–4. `final` sets it; nothing else may. */
  heldOut?: boolean;
}

/** Every artifact with human marks in the wanted folds, scored. */
export async function scoreGold(db: Db, options: GoldOptions = {}): Promise<ArtifactScore[]> {
  const wanted = (hash: string) => (options.heldOut ? !isTraining(hash) : isTraining(hash));

  const marked = await db
    .selectDistinct({ textHash: assertions.textHash })
    .from(assertions)
    .where(
      and(
        eq(assertions.sourceType, "annotation"),
        eq(assertions.status, "active"),
        isNotNull(assertions.textHash),
        isNotNull(assertions.startOff),
      ),
    );

  const complete = await completeArtifacts(db);
  const out: ArtifactScore[] = [];

  for (const row of marked) {
    const textHash = row.textHash!;
    if (!wanted(textHash)) continue;

    const [text] = await db.select().from(artifactTexts).where(eq(artifactTexts.textHash, textHash)).limit(1);
    if (!text) continue;

    const gold = await goldSpans(db, textHash);
    if (gold.length === 0) continue;

    const run = await newestOkRun(db, textHash);
    const predicted = run ? await predictedSpans(db, run.id) : [];

    out.push({
      artifactId: text.artifactId,
      textHash,
      complete: complete.has(text.artifactId),
      score: score(text.canonicalText, gold, predicted),
      notStated: await notStatedAccuracy(db, textHash, text.artifactId, run?.id ?? null, complete.has(text.artifactId)),
    });
  }
  return out;
}

/** The human marks: `confirmed` and `corroborated` rows from annotations. */
async function goldSpans(db: Db, textHash: string): Promise<LabelledSpan[]> {
  const rows = await db
    .select()
    .from(assertions)
    .where(
      and(
        eq(assertions.textHash, textHash),
        eq(assertions.sourceType, "annotation"),
        eq(assertions.status, "active"),
        isNotNull(assertions.startOff),
      ),
    );
  return rows
    .filter((row) => row.confidence === "confirmed" || row.confidence === "corroborated")
    .filter((row) => classOf(row.facet) !== null)
    .map((row) => ({ start: row.startOff!, end: row.endOff!, facet: row.facet! }));
}

async function newestOkRun(db: Db, textHash: string) {
  const rows = await db
    .select()
    .from(extractionRuns)
    .where(
      and(
        eq(extractionRuns.textHash, textHash),
        eq(extractionRuns.variant, VARIANT),
        eq(extractionRuns.status, "ok"),
      ),
    )
    .orderBy(desc(extractionRuns.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * What the run predicted — including the rows a human highlight took the
 * place of.
 *
 * Those are found through the human row's `provenance.reconciled_from`,
 * which is where reconciliation keeps the model's credit. Their *own*
 * spans are scored, not the human's: a boundary case that drifted two words
 * should read as a boundary case, not as a perfect hit.
 */
async function predictedSpans(db: Db, runId: string): Promise<LabelledSpan[]> {
  const rows = await db.select().from(assertions).where(eq(assertions.extractionRunId, runId));
  const credited = await reconciledFrom(db);
  return rows
    .filter((row) => row.status === "active" || credited.has(row.id))
    .filter((row) => row.startOff !== null && row.text !== NOT_STATED)
    .filter((row) => classOf(row.facet) !== null)
    .map((row) => ({ start: row.startOff!, end: row.endOff!, facet: row.facet! }));
}

/** Model assertion ids a human row names as the find it replaced. */
async function reconciledFrom(db: Db): Promise<Set<string>> {
  const rows = await db
    .select({ provenance: assertions.provenance })
    .from(assertions)
    .where(and(eq(assertions.sourceType, "annotation"), eq(assertions.status, "active")));
  const out = new Set<string>();
  for (const row of rows) {
    const from = (row.provenance as { reconciled_from?: { assertion_id?: string } }).reconciled_from;
    if (from?.assertion_id) out.add(from.assertion_id);
  }
  return out;
}

/**
 * Whether the run was right about what the abstract does *not* say.
 *
 * Only complete sessions can answer that: an absence toggle is a reader
 * saying "I looked and it is not there", and only an exhaustive reading
 * makes that claim.
 */
async function notStatedAccuracy(
  db: Db,
  textHash: string,
  artifactId: string,
  runId: string | null,
  complete: boolean,
) {
  const empty = { hits: 0, misses: 0, falsePositives: 0 };
  if (!complete || !runId) return empty;

  const human = await db
    .select()
    .from(assertions)
    .where(and(eq(assertions.subjectId, artifactId), eq(assertions.sourceType, "annotation"), eq(assertions.status, "active")));
  const readerAbsent = new Set<Facet>(
    human.filter((row) => row.text === NOT_STATED && row.facet).map((row) => row.facet!),
  );
  const readerMarked = new Set<Facet>(
    human.filter((row) => row.text !== NOT_STATED && row.facet).map((row) => row.facet!),
  );

  const model = await db.select().from(assertions).where(eq(assertions.extractionRunId, runId));
  const modelAbsent = new Set<Facet>(
    model.filter((row) => row.text === NOT_STATED && row.facet).map((row) => row.facet!),
  );
  const modelStated = new Set<Facet>(
    model.filter((row) => row.text !== NOT_STATED && row.facet).map((row) => row.facet!),
  );

  let hits = 0;
  let misses = 0;
  let falsePositives = 0;
  for (const facet of modelAbsent) {
    if (readerAbsent.has(facet)) hits += 1;
    if (readerMarked.has(facet)) misses += 1;
  }
  for (const facet of readerAbsent) if (modelStated.has(facet)) falsePositives += 1;
  return { hits, misses, falsePositives };
}

const mean = (values: number[]) => (values.length === 0 ? 0 : values.reduce((n, v) => n + v, 0) / values.length);
const ratio = (hit: number, total: number) => (total === 0 ? null : hit / total);

export interface GoldReport {
  n: number;
  headline: number;
  ci: [number, number];
  tokenF1: { purpose: number; mechanism: number };
  spanF1: { purpose: number; mechanism: number };
  precision: number;
  /** Null when no artifact has a complete session — `n/a`, never 0. */
  recall: number | null;
  completeN: number;
  notStated: number | null;
}

export function report(scores: ArtifactScore[]): GoldReport {
  const headlines = scores.map((s) => s.score.headline);
  const interval = bootstrap(headlines);
  const complete = scores.filter((s) => s.complete);

  const precisions = scores.flatMap((s) => [s.score.token.purpose.precision, s.score.token.mechanism.precision]);
  const recalls = complete.flatMap((s) => [s.score.token.purpose.recall, s.score.token.mechanism.recall]);

  const absence = complete.reduce(
    (acc, s) => ({
      hits: acc.hits + s.notStated.hits,
      misses: acc.misses + s.notStated.misses,
      falsePositives: acc.falsePositives + s.notStated.falsePositives,
    }),
    { hits: 0, misses: 0, falsePositives: 0 },
  );

  return {
    n: scores.length,
    headline: interval.mean,
    ci: interval.ci,
    tokenF1: {
      purpose: mean(scores.map((s) => s.score.token.purpose.f1)),
      mechanism: mean(scores.map((s) => s.score.token.mechanism.f1)),
    },
    spanF1: {
      purpose: mean(scores.map((s) => s.score.span.purpose.f1)),
      mechanism: mean(scores.map((s) => s.score.span.mechanism.f1)),
    },
    precision: mean(precisions),
    recall: complete.length === 0 ? null : mean(recalls),
    completeN: complete.length,
    notStated: ratio(absence.hits, absence.hits + absence.misses + absence.falsePositives),
  };
}

/** The header is written before the first row so the caveat is above the
 *  numbers rather than in a commit message. */
export function ensureHeader(bench: string, text: string, dir = RESULTS_DIR): void {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${bench}.md`);
  if (!existsSync(file)) writeFileSync(file, text, "utf8");
}

export async function run(ctx: { args: string[]; db?: Db }): Promise<void> {
  const db = ctx.db ?? (await getDb());
  const scores = await scoreGold(db);

  if (scores.length === 0) {
    console.log("no annotated artifacts in folds 1–4 yet — read something at /harness");
    console.log("0");
    return;
  }

  const summary = report(scores);
  const [text] = await db
    .select()
    .from(extractionRuns)
    .where(and(eq(extractionRuns.variant, VARIANT), eq(extractionRuns.status, "ok"), ne(extractionRuns.id, "")))
    .orderBy(desc(extractionRuns.createdAt))
    .limit(1);

  for (const artifact of scores) {
    console.log(
      `${artifact.textHash.slice(0, 12)} ${artifact.complete ? "complete" : "casual  "} ` +
        `headline ${artifact.score.headline.toFixed(3)}`,
    );
  }
  console.log(
    `\nn = ${summary.n} (${summary.completeN} complete) · token F1 purpose ${summary.tokenF1.purpose.toFixed(3)}, ` +
      `mechanism ${summary.tokenF1.mechanism.toFixed(3)} · span F1 purpose ${summary.spanF1.purpose.toFixed(3)}, ` +
      `mechanism ${summary.spanF1.mechanism.toFixed(3)}`,
  );
  console.log(
    `precision ${summary.precision.toFixed(3)} · recall ${summary.recall === null ? "n/a" : summary.recall.toFixed(3)} · ` +
      `not_stated ${summary.notStated === null ? "n/a" : summary.notStated.toFixed(3)}`,
  );

  ensureHeader("gold", GOLD_HEADER);
  appendResult({
    bench: "gold",
    headline: summary.headline.toFixed(3),
    n: summary.n,
    ci: summary.ci,
    promptVersion: text?.promptVersion,
    coreVersion: text?.coreVersion,
    model: text?.model,
    tokens: null,
    extra:
      `token F1 p ${summary.tokenF1.purpose.toFixed(2)} / m ${summary.tokenF1.mechanism.toFixed(2)}; ` +
      `span F1 p ${summary.spanF1.purpose.toFixed(2)} / m ${summary.spanF1.mechanism.toFixed(2)}; ` +
      `precision ${summary.precision.toFixed(2)}; recall ${summary.recall === null ? "n/a" : summary.recall.toFixed(2)}; ` +
      `not_stated ${summary.notStated === null ? "n/a" : summary.notStated.toFixed(2)}; complete ${summary.completeN}`,
  });

  console.log(summary.headline.toFixed(3));
}
