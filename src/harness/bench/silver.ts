/** `npm run bench -- silver` — agreement, and the report says so.
 *
 * The TOCHI 2022 release is 3.3M Springer abstracts with one
 * model-emitted `purpose` string each. No mechanism column, no spans, no
 * offsets, no split, no licence: silver, not gold. Their "0.65" is token
 * F1 on 50 validation abstracts we do not have, so it cannot be run here
 * and this bench does not pretend to.
 *
 * What it is worth: a number on the purpose facet, in our target genre, at
 * a scale nothing else here reaches, for almost nothing. It is scored as a
 * bag of tokens rather than by offsets, because a model-written summary is
 * not a span of the abstract and matching it by position would measure the
 * wrong thing.
 *
 * The row is labelled `silver agreement (purpose)` and the word silver
 * never comes off it. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, type Db } from "@/db/client";
import { assertions, document } from "@/db/schema";
import { normalize, putArtifactText } from "../canonical";
import { addCost, costOf, extractPaper } from "../papers/extract";
import { appendResult } from "./results";
import { bootstrap, tokenize } from "./tokens";

export const TOCHI_CSV = path.join(process.cwd(), "data", "harness", "tochi", "id_ending_with_0.csv");
const DEFAULT_SAMPLE = 500;
/** The embedder takes 128 at a time; a batch the same size keeps one run's
 *  worth of rows within one call. */
const BATCH = 128;

export interface SilverRow {
  id: string;
  abstract: string;
  purpose: string;
}

/** A CSV reader for the one file this bench reads: quoted fields, doubled
 *  quotes, embedded newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** The three columns this bench needs, found by name rather than by
 *  position — the release's column order has moved before. */
export function readSilver(file = TOCHI_CSV): SilverRow[] {
  if (!existsSync(file)) return [];
  const rows = parseCsv(readFileSync(file, "utf8"));
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const at = (...names: string[]) => {
    for (const name of names) {
      const index = header.indexOf(name);
      if (index >= 0) return index;
    }
    return -1;
  };
  const idAt = at("id", "paper_id", "doi");
  const abstractAt = at("abstract", "text");
  const purposeAt = at("purpose", "purpose_text", "predicted_purpose");
  if (abstractAt < 0 || purposeAt < 0) return [];

  const out: SilverRow[] = [];
  for (const row of rows.slice(1)) {
    const abstract = (row[abstractAt] ?? "").trim();
    const purpose = (row[purposeAt] ?? "").trim();
    if (abstract.length === 0 || purpose.length === 0) continue;
    out.push({ id: idAt >= 0 ? (row[idAt] ?? "") : String(out.length), abstract, purpose });
  }
  return out;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sample<T>(items: T[], n: number, seed = 23): T[] {
  if (items.length <= n) return items;
  const next = rng(seed);
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

const bag = (text: string) => new Set(tokenize(normalize(text)).map((t) => t.text.toLowerCase()));

/** Token agreement between our purpose text and theirs. Not F1 against
 *  gold — neither side is gold. */
export function agreement(ours: string[], theirs: string): number {
  const mine = new Set<string>();
  for (const text of ours) for (const token of bag(text)) mine.add(token);
  const yours = bag(theirs);
  if (mine.size === 0 && yours.size === 0) return 1;
  if (mine.size === 0 || yours.size === 0) return 0;
  let shared = 0;
  for (const token of mine) if (yours.has(token)) shared += 1;
  const precision = shared / mine.size;
  const recall = shared / yours.size;
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

export async function run(ctx: { args: string[]; db?: Db }): Promise<void> {
  const rows = readSilver();
  if (rows.length === 0) {
    console.error(
      `no TOCHI silver at ${TOCHI_CSV}.\n` +
        "Place `id_ending_with_0.csv` from the TOCHI 2022 release there by hand — it is\n" +
        "gitignored, has no stated licence, and is not redistributed with this repository.",
    );
    process.exitCode = 1;
    return;
  }

  const wanted = ctx.args.includes("--all") ? rows : sample(rows, DEFAULT_SAMPLE);
  const db = ctx.db ?? (await getDb());

  const scores: number[] = [];
  let total = { tokens: null as number | null, cost: null as string | null };
  let promptVersion: string | undefined;
  let coreVersion: string | undefined;
  let model: string | undefined;

  for (let at = 0; at < wanted.length; at += BATCH) {
    for (const row of wanted.slice(at, at + BATCH)) {
      const text = normalize(row.abstract);
      if (text.length === 0) continue;

      const [doc] = await db
        .insert(document)
        .values({ source: "paper", title: `TOCHI silver ${row.id}`, text })
        .returning({ id: document.id });
      const put = await putArtifactText(db, {
        artifactId: doc.id,
        sourceFormat: "abstract",
        parser: "tochi-silver-v1",
        text,
        provenance: { source: "tochi_silver", silver_id: row.id },
      });

      const result = await extractPaper(db, put.textHash);
      if (result.run.status !== "ok") continue;
      promptVersion = result.run.promptVersion;
      coreVersion = result.run.coreVersion;
      model = result.run.model;
      total = addCost(total, addCost(costOf(result.run), costOf(result.ladderRun)));

      const ours = await db.select().from(assertions).where(eq(assertions.extractionRunId, result.run.id));
      const purposes = ours
        .filter((a) => a.facet === "purpose" && a.abstractionLevel === "specific" && a.text !== "not_stated")
        .map((a) => a.text);
      scores.push(agreement(purposes, row.purpose));
    }
    console.log(`… ${Math.min(at + BATCH, wanted.length)} of ${wanted.length}`);
  }

  if (scores.length === 0) {
    console.log("nothing scored");
    console.log("0");
    return;
  }

  const interval = bootstrap(scores);
  console.log(`\nn = ${scores.length} · tokens ${total.tokens ?? "unknown"} · cost ${total.cost ?? "unknown"}`);

  appendResult({
    bench: "silver",
    headline: `silver agreement (purpose) ${interval.mean.toFixed(3)}`,
    n: scores.length,
    ci: interval.ci,
    promptVersion,
    coreVersion,
    model,
    tokens: total.tokens,
    cost: total.cost,
    extra: "TOCHI 2022 silver — a model-emitted purpose string, not gold; agreement, not F1",
  });

  console.log(interval.mean.toFixed(3));
}
