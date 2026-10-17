/** `npm run lodestone:ingest -- --source openalex|patents --query "<text>"
 *    [--since 2018] [--limit 500] [--set <name>] [--cursor <value>]`
 *  `npm run lodestone:ingest -- --source openalex|patents --list <file> [--set <name>]`
 *
 * Grow the prior-art corpus. A query pages OpenAlex works (with an abstract)
 * or PatentsView granted patents; a list file names one DOI, OpenAlex id or
 * patent number per line. Each work prints one line — identifier, artifact,
 * text hash, and whether it was new; or why nothing was written (`no_abstract`,
 * `short_abstract` under thirty words, `not_found`). Nothing is buffered, so a run that
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
 * it. `PATENTSVIEW_API_KEY` is required for patents. Honours `DATABASE_URL`;
 * without it opens the local PGlite directory, which `next dev` must not hold
 * at the same time. */
import "../harness/env.mts";
import { readFileSync } from "node:fs";
import { and, inArray, isNull, eq } from "drizzle-orm";
import { getDb } from "../../src/db/client";
import { document, documentChunk } from "../../src/db/schema";
import { embed } from "../../src/harness/embed";
import { fetchWork, type OpenAlexWork } from "../../src/harness/papers/openalex";
import { ingestLine, ingestWork, MIN_ABSTRACT_WORDS, parseList, type IngestResult } from "../../src/harness/papers/ingest";
import { fetchPatent, ingestPatent, searchPatents, type PatentIngestResult, type PatentsViewPatent } from "../../src/harness/papers/patentsview";
import { limiter, openalexLimiter, openalexPerSecond, PATENTSVIEW_PER_MINUTE } from "../../src/harness/papers/rate";
import { searchWorks, type SearchResult } from "../../src/harness/papers/search";
import { CORPUS_SOURCES, corpusOrphans, embedPaperAbstracts } from "../../src/lodestone/priorArt";

const args = process.argv.slice(2);
const flag = (name: string): string | null => {
  const at = args.indexOf(name);
  const value = at === -1 ? undefined : args[at + 1];
  if (value?.startsWith("--")) usage(`${name} needs a value.`);
  return value ?? null;
};
const usage = (message: string): never => {
  console.error(`${message}\nusage: lodestone:ingest --source openalex|patents (--query "<text>" [--since <year>] [--limit <n>] [--cursor <c>] | --list <file>) [--set <name>]`);
  process.exit(1);
};

const source = flag("--source");
if (source !== "openalex" && source !== "patents") usage(`Unknown --source ${source ?? "(none)"}.`);
const query = flag("--query");
const list = flag("--list");
if (!query === !list) usage("Give exactly one of --query and --list.");
const since = flag("--since") === null ? null : Number(flag("--since"));
if (since !== null && !Number.isInteger(since)) usage("--since is a year.");
const limit = flag("--limit") === null ? undefined : Number(flag("--limit"));
if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) usage("--limit is a positive whole number.");
const set = flag("--set") ?? query;
const provenance = { ...(set ? { query_set: set } : {}), ...(query ? { query } : {}) };

if (source === "patents" && !process.env.PATENTSVIEW_API_KEY?.trim()) usage("PATENTSVIEW_API_KEY is not set; PatentsView answers nothing without a key.");
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

const db = await getDb();
const tally = { new: 0, existing: 0, no_abstract: 0, short_abstract: 0, not_found: 0 };

function report(result: IngestResult | PatentIngestResult) {
  if (result.status === "ok") tally[result.created ? "new" : "existing"] += 1;
  else tally[result.status] += 1;
  const suffix = result.status === "ok" ? (result.created ? " new" : " existing") : "";
  console.log(`${ingestLine(result)}${suffix}`);
}

let stop: SearchResult | null = null;

if (query) {
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
        : await searchPatents({ query, since, limit, cursor, onPage }, async (patent: PatentsViewPatent) => {
            report(await ingestPatent(db, patent.patent_id ?? "unknown", { fetchPatent: async () => patent, provenance, minWords: MIN_ABSTRACT_WORDS }));
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
  const wait = source === "openalex" ? openalexLimiter() : limiter(PATENTSVIEW_PER_MINUTE, 60_000);
  const throttled =
    <T,>(fetcher: (id: string) => Promise<T>) =>
    async (id: string) => {
      await wait();
      return fetcher(id);
    };
  for (const [at, id] of ids.entries()) {
    try {
      report(
        source === "openalex"
          ? await ingestWork(db, id, { fetchWork: throttled((x) => fetchWork(x)), provenance, minWords: MIN_ABSTRACT_WORDS })
          : await ingestPatent(db, id, { fetchPatent: throttled((x) => fetchPatent(x)), provenance, minWords: MIN_ABSTRACT_WORDS }),
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
  `# ${tally.new} new, ${tally.existing} existing, ${tally.no_abstract} no_abstract, ${tally.short_abstract} short_abstract, ${tally.not_found} not_found; ${embedded} embedded, ${unembedded.length} without a vector, ${await corpusOrphans(db)} without a canonical text`,
);

if (stop) {
  console.error(`# stopped: ${stop.reason}`);
  console.error(stop.cursor ? `# resume with --cursor ${stop.cursor}` : "# resume by running the same command again");
  process.exit(2);
}
process.exit(0);
