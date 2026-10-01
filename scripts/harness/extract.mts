/** `npm run extract -- --variant abstract [--all (papers only) | --list <file> | <hash>…] [--force]`
 *
 * A text with an `ok` run at the current prompt version and model is
 * skipped and says so; a `failed` one is retried at the next attempt. The
 * exit code is non-zero when any run in the batch finished `failed` — a
 * batch that could not extract is not a batch that had nothing to do. */
// Must come first: modules below read `process.env` when they load.
import "./env.mts";
import { readFileSync } from "node:fs";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../../src/db/client";
import { artifactTexts, document } from "../../src/db/schema";
import { parseList } from "../../src/harness/papers/ingest";
import { addCost, costOf, extractPaper, newestRun, transferableInsight } from "../../src/harness/papers/extract";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const value = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);

const variant = value("--variant") ?? "abstract";
const force = flag("--force");
const listFile = value("--list");
const explicit = argv.filter((arg) => /^[0-9a-f]{64}$/.test(arg));

const db = await getDb();

let hashes: string[] = explicit;
if (listFile) hashes = [...hashes, ...parseList(readFileSync(listFile, "utf8"))];
if (flag("--all")) {
  // Papers only. `artifact_texts` is the whole harness's canonical store —
  // resumes, decks and conversation windows live there too — so an unscoped
  // `--all` runs the paper prompt over a founder's resume and files the
  // result as a `paper` subject. It costs a fortune and quietly poisons
  // analogy candidate selection, which trusts `subject_type`.
  const rows = await db
    .select({ textHash: artifactTexts.textHash })
    .from(artifactTexts)
    .innerJoin(document, eq(document.id, artifactTexts.artifactId))
    .where(eq(document.source, "paper"))
    .orderBy(asc(artifactTexts.createdAt));
  hashes = [...hashes, ...rows.map((r) => r.textHash)];
}
hashes = [...new Set(hashes)];

if (hashes.length === 0) {
  console.error(
    "usage: npm run extract -- --variant abstract [--all (papers only) | --list <file> | <text_hash>…] [--force]",
  );
  process.exit(1);
}

let failed = 0;
let skipped = 0;
let total = { tokens: null as number | null, cost: null as string | null };

for (const textHash of hashes) {
  const short = textHash.slice(0, 12);
  const before = await newestRun(db, textHash, variant);
  if (!force && before?.status === "ok") {
    skipped += 1;
    console.log(`${short} skipped — ok at this prompt version`);
    continue;
  }

  try {
    const result = await extractPaper(db, textHash, { force, variant });
    const cost = addCost(costOf(result.run), costOf(result.ladderRun));
    total = addCost(total, cost);
    if (result.run.status === "failed") {
      failed += 1;
      console.log(`${short} failed — ${result.run.error ?? "no reason recorded"}`);
      continue;
    }
    const stats = (result.run.stats ?? {}) as { unanchored?: number; ambiguous?: number };
    const insight = transferableInsight(result.run);
    console.log(
      `${short} ok — unanchored ${stats.unanchored ?? 0}, ambiguous ${stats.ambiguous ?? 0}, ` +
        `tokens ${cost.tokens ?? "unknown"}, cost ${cost.cost ?? "unknown"}` +
        (insight ? `\n             ${insight}` : ""),
    );
  } catch (err) {
    failed += 1;
    console.log(`${short} error — ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(
  `\n${hashes.length} text${hashes.length === 1 ? "" : "s"}: ${hashes.length - skipped - failed} extracted, ` +
    `${skipped} skipped, ${failed} failed · tokens ${total.tokens ?? "unknown"} · cost ${total.cost ?? "unknown"}`,
);
process.exit(failed > 0 ? 1 : 0);
