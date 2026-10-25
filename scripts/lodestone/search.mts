/** `npm run lodestone:search -- --q "<text>" [--q "<text>" …] [--k 30] [--set <name>] [--openalex] [--json <file>]`
 *
 * The stored papers nearest a research question (`src/harness/research/search.ts`):
 * the question is embedded in Voyage's query role and matched by cosine over
 * `document_chunk`. `--q` may repeat, one per sub-claim of the question: each
 * is searched for `k`, and the lists are merged, each paper once at its best
 * similarity. `--set` keeps only one ingest set, `neurips-2021-2026`
 * for the NeurIPS corpus. `--openalex` adds up to `k` live OpenAlex works for
 * the same question, by W-id, and writes none of them: only a work a review
 * cites is ingested, by `lodestone:research-links`. `--json` writes every
 * hit to a file, absent metrics as `null`; the printed list says `unknown`.
 *
 * Refuses to run without `VOYAGE_API_KEY`. Honours `DATABASE_URL`; without
 * it opens the local PGlite directory, which `next dev` must not hold at the
 * same time. */
import "../harness/env.mts";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDb } from "../../src/db/client";
import { embed } from "../../src/harness/embed";
import { mergeHits, openalexHits, searchPapers, type PaperSearchHit } from "../../src/harness/research/search";

const args = process.argv.slice(2);
const usage = (message: string): never => {
  console.error(`${message}\nusage: lodestone:search --q "<text>" [--q "<text>" …] [--k <n>] [--set <name>] [--openalex] [--json <file>]`);
  process.exit(1);
};
const flag = (name: string): string | null => {
  const at = args.indexOf(name);
  const value = at === -1 ? undefined : args[at + 1];
  if (at !== -1 && (value === undefined || value.startsWith("--"))) usage(`${name} needs a value.`);
  return value ?? null;
};

const qs = args.flatMap((arg, at) => (arg === "--q" ? [args[at + 1]] : []));
if (qs.length === 0 || qs.some((q) => !q?.trim() || q.startsWith("--"))) usage("--q is required, with text after each one.");
const k = flag("--k") === null ? 30 : Number(flag("--k"));
if (!(Number.isInteger(k) && k > 0)) usage("--k is a positive whole number.");
const set = flag("--set");
const json = flag("--json");
const withOpenalex = args.includes("--openalex");
if (!process.env.VOYAGE_API_KEY?.trim()) {
  console.error("VOYAGE_API_KEY is not set: the question cannot be embedded, so nothing is searched.");
  process.exit(1);
}

const db = await getDb();
const lists: PaperSearchHit[][] = [];
for (const q of qs) {
  lists.push(await searchPapers(db, embed, { q, k, set }));
  if (withOpenalex) {
    const live = await openalexHits(q, k, { onNotice: (notice) => console.log(`# OpenAlex: ${notice}`) });
    if (live.stopped) console.error(`# OpenAlex stopped on "${q}": ${live.stopped}`);
    lists.push(live.hits);
  }
}
const hits = mergeHits(lists);

const shown = (value: number | null, digits = 2) => (value === null ? "unknown" : Number.isInteger(value) ? String(value) : value.toFixed(digits));
for (const [at, hit] of hits.entries()) {
  const similarity = hit.similarity === null ? "  live" : hit.similarity.toFixed(3);
  console.log(`${String(at + 1).padStart(3)}. ${similarity}  ${hit.title ?? "(untitled)"} (${hit.year ?? "unknown"})`);
  console.log(`      ${hit.id}  ${hit.source === "openalex" ? "openalex" : hit.query_set ?? "no set"}  rating ${shown(hit.rating_avg)}  citations/yr ${shown(hit.citations_per_year, 1)}  ${hit.link ?? ""}`);
}
console.log(`# ${hits.filter((h) => h.source === "corpus").length} stored, ${hits.filter((h) => h.source === "openalex").length} live from OpenAlex`);

if (json) {
  mkdirSync(path.dirname(path.resolve(json)), { recursive: true });
  writeFileSync(json, `${JSON.stringify(hits, null, 2)}\n`);
  console.log(`# written to ${json}`);
}
process.exit(0);
