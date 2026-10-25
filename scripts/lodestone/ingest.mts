/** `npm run lodestone:ingest -- --source openalex|patents --query "<text>"
 *    [--since 2018] [--limit 500] [--set <name>] [--cursor <value>]`
 *  `npm run lodestone:ingest -- --source openalex|patents --list <file> [--set <name>]`
 *  `npm run lodestone:ingest -- --source xlsx --file <path> --set <name>`
 *
 * Grow the prior-art corpus. A query pages OpenAlex works (with an abstract)
 * or granted US patents from Google Patents on BigQuery; a list file names
 * one DOI, OpenAlex id or patent number per line. `xlsx` reads the `Corpus`
 * sheet of the NeurIPS spreadsheet, one paper a row keyed on its `id`
 * column (`src/harness/papers/xlsx.ts`); it needs `--set`, and refuses to
 * start without `VOYAGE_API_KEY`, since a corpus that size is loaded to be
 * searched. Each work prints one line — identifier, artifact,
 * text hash, and whether it was new; or why nothing was written (`no_abstract`,
 * `short_abstract` under thirty words, `not_found`, and for a sheet row with
 * neither abstract nor tldr `no_text`). Nothing is buffered, so a run that
 * dies keeps what it wrote. `--set` names the query set (default: the query
 * itself) and rides in provenance so a hit can say where it came from.
 *
 * A work already held by its DOI, OpenAlex id or patent number is answered
 * from the stored row, so re-running the same query writes nothing. The run
 * ends by embedding every paper and patent without a vector, so one killed
 * mid-embed is finished by the next.
 *
 * On a rate limit or a network failure the run stops, embeds what it wrote,
 * prints the cursor to resume from, and exits 2.
 *
 * `OPENALEX_API_KEY` rides on every OpenAlex request: it buys the key's own
 * daily budget and 25 requests a second, and lets a query page past its first
 * 200 (OpenAlex refuses cursor paging without one). Without it the run draws
 * on the shared keyless budget at 10 a second. `OPENALEX_MAILTO` rides beside
 * it. Patents need `GOOGLE_CLOUD_PROJECT` and
 * `GOOGLE_APPLICATION_CREDENTIALS_JSON`: one BigQuery job per query (or per
 * list), capped by `BIGQUERY_MAX_BYTES`, its pages read by token; the
 * printed cursor is `<job id>:<page token>` and resumes without a second
 * scan. Honours `DATABASE_URL`; without it opens the local PGlite directory,
 * which `next dev` must not hold at the same time. */
import "../harness/env.mts";
import { readFileSync } from "node:fs";
import { and, inArray, isNull, eq } from "drizzle-orm";
import { getDb } from "../../src/db/client";
import { document, documentChunk } from "../../src/db/schema";
import { embed } from "../../src/harness/embed";
import { fetchWork, type OpenAlexWork } from "../../src/harness/papers/openalex";
import { ingestLine, ingestWork, MIN_ABSTRACT_WORDS, parseList, type IngestResult } from "../../src/harness/papers/ingest";
import { BIGQUERY_ENV, bigqueryClient, bigqueryMaxBytes, ingestPatent, patentFetcher, searchPatents, type PatentIngestResult, type PatentRow } from "../../src/harness/papers/bigquery-patents";
import { openalexLimiter, openalexPerSecond } from "../../src/harness/papers/rate";
import { searchWorks, type SearchResult } from "../../src/harness/papers/search";
import { ingestNeuripsRow, readCorpusSheet, rowOf, type NeuripsIngestResult } from "../../src/harness/papers/xlsx";
import { CORPUS_SOURCES, corpusOrphans, embedPaperAbstracts } from "../../src/lodestone/priorArt";

const args = process.argv.slice(2);
const flag = (name: string): string | null => {
  const at = args.indexOf(name);
  const value = at === -1 ? undefined : args[at + 1];
  if (value?.startsWith("--")) usage(`${name} needs a value.`);
  return value ?? null;
};
const usage = (message: string): never => {
  console.error(
    `${message}\nusage: lodestone:ingest --source openalex|patents (--query "<text>" [--since <year>] [--limit <n>] [--cursor <c>] | --list <file>) [--set <name>]\n` +
      `       lodestone:ingest --source xlsx --file <path> --set <name>`,
  );
  process.exit(1);
};

const source = flag("--source");
if (source !== "openalex" && source !== "patents" && source !== "xlsx") usage(`Unknown --source ${source ?? "(none)"}.`);
const query = flag("--query");
const list = flag("--list");
const file = flag("--file");
if (source === "xlsx") {
  if (!file) usage("--source xlsx needs --file.");
  if (!flag("--set")) usage("--source xlsx needs --set.");
  if (!process.env.VOYAGE_API_KEY?.trim()) usage("VOYAGE_API_KEY is required for --source xlsx: the corpus is loaded to be searched, and nothing matches without a vector.");
} else if (!query === !list) usage("Give exactly one of --query and --list.");
const since = flag("--since") === null ? null : Number(flag("--since"));
if (since !== null && !Number.isInteger(since)) usage("--since is a year.");
const limit = flag("--limit") === null ? undefined : Number(flag("--limit"));
if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) usage("--limit is a positive whole number.");
const set = flag("--set") ?? query;
const provenance = { ...(set ? { query_set: set } : {}), ...(query ? { query } : {}) };

const patents = source === "patents" ? bigqueryClient() : null;
if (source === "patents" && !patents) {
  usage(`${BIGQUERY_ENV.filter((name) => !process.env[name]?.trim()).join(" and ")} not set; BigQuery runs no job without a billing project and a service account.`);
}
if (patents) console.log(`# BigQuery under GOOGLE_CLOUD_PROJECT=${process.env.GOOGLE_CLOUD_PROJECT!.trim()}: at most ${bigqueryMaxBytes()} bytes billed a job`);
if (!process.env.VOYAGE_API_KEY?.trim()) console.log("VOYAGE_API_KEY is not set: works are written without vectors and nothing will match until a run with a key.");
if (source === "openalex") {
  console.log(
    process.env.OPENALEX_API_KEY?.trim()
      ? `# OpenAlex under OPENALEX_API_KEY: ${openalexPerSecond()} requests a second`
      : `# OPENALEX_API_KEY is not set: OpenAlex runs on the shared keyless budget ($0.10 a day), ${openalexPerSecond()} requests a second, and a query stops after its first page`,
  );
}

// OpenAlex says in `meta.notice` when a run is drawing on a budget; say it once.
let noticed = false;
const onNotice = (notice: string) => {
  if (noticed || !/budget/i.test(notice)) return;
  noticed = true;
  console.log(`# OpenAlex: ${notice}`);
};
// BigQuery says what a job scanned once its first page arrives; that is the bill.
const onJob = (job: { jobId: string; totalBytesProcessed: number | null }) =>
  console.log(`# BigQuery job ${job.jobId}: ${job.totalBytesProcessed ?? "unknown"} bytes processed`);

const db = await getDb();
const tally = { new: 0, existing: 0, thin: 0, no_abstract: 0, short_abstract: 0, not_found: 0, no_text: 0 };

function report(result: IngestResult | PatentIngestResult | NeuripsIngestResult) {
  if (result.status === "ok") tally[result.created ? "new" : "existing"] += 1;
  else tally[result.status] += 1;
  // A TLDR-only row a card search stored earlier; this command never writes one.
  if ("thin" in result && result.thin) tally.thin += 1;
  const suffix = result.status === "ok" ? `${result.created ? " new" : " existing"}${"thin" in result && result.thin ? " thin" : ""}` : "";
  console.log(`${ingestLine(result)}${suffix}`);
}

let stop: SearchResult | null = null;

if (source === "xlsx") {
  let at = 0;
  try {
    for await (const cells of readCorpusSheet(file!)) {
      at += 1;
      const row = rowOf(cells);
      if (!row) {
        console.log(`# row ${at + 1} has no id; skipped`);
        continue;
      }
      report(await ingestNeuripsRow(db, row, { set: set! }));
    }
  } catch (error) {
    // Every row already held is skipped by id on the re-read.
    stop = { seen: at, stopped: true, cursor: null, reason: `row ${at + 1}: ${error instanceof Error ? error.message : String(error)}` };
  }
} else if (query) {
  // The page being written, so a failure inside it can resume there: the
  // works it already wrote are skipped by id on the re-read.
  let page: string | null = flag("--cursor");
  let seen = 0;
  const onPage = (p: { cursor: string; works: number }) => {
    page = p.cursor === "start" ? null : p.cursor;
    console.log(`# page cursor=${p.cursor} works=${p.works}`);
  };
  const cursor = flag("--cursor");
  try {
    const result =
      source === "openalex"
        ? await searchWorks({ query, since, limit, cursor, onPage, onNotice }, async (work: OpenAlexWork) => {
            report(await ingestWork(db, work.id ?? work.doi ?? "unknown", { fetchWork: async () => work, provenance, minWords: MIN_ABSTRACT_WORDS }));
            seen += 1;
          })
        : await searchPatents({ query, since, limit, cursor, client: patents!, onPage, onJob }, async (row: PatentRow) => {
            report(await ingestPatent(db, row.publication_number ?? "unknown", { fetchPatent: async () => row, provenance, minWords: MIN_ABSTRACT_WORDS }));
            seen += 1;
          });
    if (result.stopped) stop = result;
    else if (result.cursor) console.log(`# limit reached; continue with --cursor ${result.cursor}`);
  } catch (error) {
    // A write that failed mid-page: resume at that page.
    stop = { seen, stopped: true, cursor: page, reason: error instanceof Error ? error.message : String(error) };
  }
} else {
  const ids = parseList(readFileSync(list!, "utf8"));
  const wait = openalexLimiter();
  const throttled =
    <T,>(fetcher: (id: string) => Promise<T>) =>
    async (id: string) => {
      await wait();
      return fetcher(id);
    };
  // One BigQuery job for the whole list, started by the first number not
  // already held: a job per number would scan the table per number.
  const fetchPatent = patents ? patentFetcher(ids, { client: patents, onJob }) : null;
  for (const [at, id] of ids.entries()) {
    try {
      report(
        source === "openalex"
          ? await ingestWork(db, id, { fetchWork: throttled((x) => fetchWork(x)), provenance, minWords: MIN_ABSTRACT_WORDS })
          : await ingestPatent(db, id, { fetchPatent: fetchPatent!, provenance, minWords: MIN_ABSTRACT_WORDS }),
      );
    } catch (error) {
      // Re-running the list is cheap: every id already held is skipped before a request.
      stop = { seen: at, stopped: true, cursor: null, reason: `${id}: ${error instanceof Error ? error.message : String(error)}` };
      break;
    }
  }
}

// A failed embed still reaches the resume line below; the next run embeds the rest.
let embedded = 0;
try {
  embedded = await embedPaperAbstracts(db, embed);
} catch (error) {
  console.error(`# embedding stopped: ${error instanceof Error ? error.message : String(error)}`);
  stop ??= { seen: 0, stopped: true, cursor: null, reason: "embedding failed" };
}
const unembedded = await db.select({ id: document.id }).from(document)
  .leftJoin(documentChunk, eq(documentChunk.documentId, document.id))
  .where(and(inArray(document.source, [...CORPUS_SOURCES]), isNull(documentChunk.id)));
console.log(
  `# ${tally.new} new, ${tally.existing} existing (${tally.thin} thin), ${tally.no_abstract} no_abstract, ${tally.short_abstract} short_abstract, ${tally.not_found} not_found, ${tally.no_text} no_text; ${embedded} embedded, ${unembedded.length} without a vector, ${await corpusOrphans(db)} without a canonical text`,
);

if (stop) {
  console.error(`# stopped: ${stop.reason}`);
  console.error(stop.cursor ? `# resume with --cursor ${stop.cursor}` : "# resume by running the same command again");
  process.exit(2);
}
process.exit(0);
