/** `npm run bench -- coda` — the one public gold in this genre.
 *
 * CODA-19 is 10,966 CORD-19 abstracts with segment-level labels. It is
 * biomedical and its phrasing is far from a business abstract, so it is a
 * sanity floor rather than a target: `gold` is the headline and `vocab`
 * catches the drift a prompt tuned to this corpus would cause.
 *
 * Their segments are joined with single spaces and passed through the
 * contract's `normalize`, so the text the extractor sees is the text the
 * labels are measured against. `Purpose` becomes `purpose`, `Method`
 * becomes `mechanism`, everything else is neither.
 *
 * The test split is never opened. Not by default, not with a flag. */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { getDb, type Db } from "@/db/client";
import { document } from "@/db/schema";
import { normalize, putArtifactText } from "../canonical";
import { extractPaper, costOf, addCost } from "../papers/extract";
import { appendResult } from "./results";
import { bootstrap, score, tokenize, type LabelledSpan } from "./tokens";

export const CODA_ROOT = path.join(process.cwd(), "data", "harness", "coda19");
const DEFAULT_SAMPLE = 100;

/** The label a CODA-19 segment carries, mapped onto the two classes the
 *  bench scores. */
export function facetOfLabel(label: string): string | null {
  const normalized = label.trim().toLowerCase();
  if (normalized === "purpose") return "purpose";
  if (normalized === "method") return "mechanism";
  return null;
}

export interface CodaSegment {
  text: string;
  facet: string | null;
}

export interface CodaAbstract {
  id: string;
  segments: CodaSegment[];
}

/** A segment is any object carrying both a text and a label, wherever the
 *  release nests it — the shape has changed between versions and the two
 *  keys have not. */
export function segmentsOf(value: unknown, out: CodaSegment[] = []): CodaSegment[] {
  if (Array.isArray(value)) {
    for (const item of value) segmentsOf(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const text = record.segment_text ?? record.text;
    const label = record.crowd_label ?? record.coarse_label ?? record.label;
    if (typeof text === "string" && typeof label === "string") {
      out.push({ text, facet: facetOfLabel(label) });
      return out;
    }
    for (const item of Object.values(record)) segmentsOf(item, out);
  }
  return out;
}

/** The dev split, and nothing else. A path naming the test split is an
 *  error, not a file to skip quietly. */
export function devFiles(root = CODA_ROOT): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "test") continue;
        walk(full);
      } else if (entry.endsWith(".json") && full.replaceAll("\\", "/").includes("/dev/")) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out.sort();
}

export function readAbstract(file: string): CodaAbstract | null {
  if (file.replaceAll("\\", "/").includes("/test/")) {
    throw new Error(`the test split is never read: ${file}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  const segments = segmentsOf(parsed).filter((s) => s.text.trim().length > 0);
  if (segments.length === 0) return null;
  return { id: path.basename(file, ".json"), segments };
}

export interface CodaText {
  id: string;
  text: string;
  gold: LabelledSpan[];
}

/**
 * Rebuild one abstract and place its labels.
 *
 * Segments are joined with single spaces and the join is normalized, so an
 * offset here means what an offset means everywhere else in the harness.
 * A segment's own span is found in the rebuilt text rather than assumed,
 * because normalization can shorten it.
 */
export function rebuild(abstract: CodaAbstract): CodaText | null {
  const pieces = abstract.segments.map((segment) => ({ ...segment, text: normalize(segment.text) }));
  const text = normalize(pieces.map((p) => p.text).join(" "));
  if (text.length === 0) return null;

  const gold: LabelledSpan[] = [];
  let at = 0;
  for (const piece of pieces) {
    const start = text.indexOf(piece.text, at);
    if (start < 0) continue;
    const end = start + piece.text.length;
    at = end;
    if (piece.facet) gold.push({ start, end, facet: piece.facet });
  }
  return { id: abstract.id, text, gold };
}

/** mulberry32, as the contract's interval uses — one seed, one sample. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sample<T>(items: T[], n: number, seed = 19): T[] {
  if (items.length <= n) return items;
  const next = rng(seed);
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/** Put a CODA abstract into the ledger so the contract's extractor can run
 *  on it. Marked in provenance as what it is. */
export async function ingestCodaText(db: Db, item: CodaText): Promise<string> {
  const [doc] = await db
    .insert(document)
    .values({ source: "paper", title: `CODA-19 ${item.id}`, text: item.text })
    .returning({ id: document.id });
  const put = await putArtifactText(db, {
    artifactId: doc.id,
    sourceFormat: "abstract",
    parser: "coda19-dev-v1",
    text: item.text,
    provenance: { source: "coda19", split: "dev", coda_id: item.id, field: "Medicine" },
  });
  return put.textHash;
}

export async function run(ctx: { args: string[]; db?: Db }): Promise<void> {
  const files = devFiles();
  if (files.length === 0) {
    console.error(
      `no CODA-19 at ${CODA_ROOT}. Run: npx tsx scripts/harness/fetch-coda.mts\n` +
        "It is gitignored and never redistributed.",
    );
    process.exitCode = 1;
    return;
  }

  const all = ctx.args.includes("--all");
  // `--sample N` is for a smoke run that must not pretend to be the
  // baseline: whatever it draws, the results row says what it drew.
  const asked = ctx.args.includes("--sample") ? Number(ctx.args[ctx.args.indexOf("--sample") + 1]) : NaN;
  const size = Number.isFinite(asked) && asked > 0 ? Math.floor(asked) : DEFAULT_SAMPLE;
  const wanted = all ? files : sample(files, size);
  const db = ctx.db ?? (await getDb());

  const headlines: number[] = [];
  let total = { tokens: null as number | null, cost: null as string | null };
  let scored = 0;
  let promptVersion: string | undefined;
  let coreVersion: string | undefined;
  let model: string | undefined;

  for (const file of wanted) {
    const abstract = readAbstract(file);
    if (!abstract) continue;
    const item = rebuild(abstract);
    if (!item || item.gold.length === 0) continue;

    const textHash = await ingestCodaText(db, item);
    const result = await extractPaper(db, textHash);
    if (result.run.status !== "ok") continue;

    promptVersion = result.run.promptVersion;
    coreVersion = result.run.coreVersion;
    model = result.run.model;
    total = addCost(total, addCost(costOf(result.run), costOf(result.ladderRun)));

    const predicted = await predictedFor(db, result.run.id);
    const one = score(item.text, item.gold, predicted);
    headlines.push(one.headline);
    scored += 1;
    console.log(`${item.id} headline ${one.headline.toFixed(3)}`);
  }

  if (scored === 0) {
    console.log("nothing scored");
    console.log("0");
    return;
  }

  const interval = bootstrap(headlines);
  console.log(`\nn = ${scored} · tokens ${total.tokens ?? "unknown"} · cost ${total.cost ?? "unknown"}`);

  appendResult({
    bench: "coda",
    headline: interval.mean.toFixed(3),
    n: scored,
    ci: interval.ci,
    promptVersion,
    coreVersion,
    model,
    tokens: total.tokens,
    cost: total.cost,
    extra: all ? "dev split, all" : `dev split, sample of ${size} by fixed seed`,
  });

  console.log(interval.mean.toFixed(3));
}

async function predictedFor(db: Db, runId: string): Promise<LabelledSpan[]> {
  const { assertions } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rows = await db.select().from(assertions).where(eq(assertions.extractionRunId, runId));
  return rows
    .filter((row) => row.startOff !== null && row.facet && row.text !== "not_stated")
    .map((row) => ({ start: row.startOff!, end: row.endOff!, facet: row.facet! }));
}

/** Exported for the test: the tokenizer the labels ride on. */
export { tokenize };
