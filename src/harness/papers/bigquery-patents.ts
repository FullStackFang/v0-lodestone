/** Google Patents Public Datasets on BigQuery, the source of a patent:
 *  granted US patents from `patents-public-data.patents.publications`, by
 *  query and grant date.
 *
 *  A patent is the same shape as a paper for everything Lodestone does — a
 *  title, an abstract, provenance, one vector — so it is written the same
 *  way: a `document` with `source = 'patent'` and an `artifact_texts` row
 *  with `source_format = 'abstract'`. `ingestPatent` mirrors `ingestWork`.
 *
 *  BigQuery bills by the columns read over the whole table, and the table is
 *  not partitioned, so every query scans the title and abstract columns in
 *  full (on the order of a hundred gigabytes) and a `WHERE` bounds nothing.
 *  Hence one job per operator query, its result set paged by
 *  `getQueryResults` token, and a `maximumBytesBilled` cap so a mistaken
 *  query fails instead of billing. The printed cursor is `<job id>:<page
 *  token>`: a page token means nothing outside its job, and a completed
 *  job's results stay readable for a day, so a resume never starts a second
 *  scan. A list of numbers is one job too (`patentFetcher`), never one per
 *  number.
 *
 *  Needs `GOOGLE_CLOUD_PROJECT` (the billing project) and
 *  `GOOGLE_APPLICATION_CREDENTIALS_JSON` (a service account with the
 *  BigQuery Job User role). The client is injected as `PatentJobClient` so
 *  tests run a fake and never touch BigQuery. */
import { BigQuery } from "@google-cloud/bigquery";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { artifactTexts, document } from "@/db/schema";
import { hashText, normalize, putArtifactText } from "../canonical";
import { storedBySourceId, wordCount, type IngestStatus } from "./ingest";
import { cpcSectionName, patentNumberOf, type PatentProvenance } from "./patents";
import type { SearchResult } from "./search";

export const PATENT_PARSER = "google-patents-abstract-v1";
/** `maximumBytesBilled` unless `BIGQUERY_MAX_BYTES` says otherwise: 200 GiB,
 *  about $1.25 at the on-demand list price, twice what one query over the
 *  title and abstract columns is expected to scan. */
export const BIGQUERY_MAX_BYTES_DEFAULT = 200 * 1024 ** 3;
/** The largest page BigQuery hands back from `getQueryResults`. */
const PER_PAGE = 1000;
/** `patents-public-data` lives in the US multi-region; a job runs where its
 *  data is, and a job is looked up by id and location. */
const LOCATION = "US";
const TABLE = "`patents-public-data.patents.publications`";

/** One row of `patentQuery`'s select list, as the Node client returns it.
 *  ASSUMED (task 2.0 verifies against the console): `grant_date` is INT64
 *  `yyyymmdd`, 0 for an application that is not a grant; `title_localized`
 *  and `abstract_localized` are `ARRAY<STRUCT<text STRING, language STRING,
 *  truncated BOOL>>`; `assignee_harmonized` and `inventor_harmonized` are
 *  `ARRAY<STRUCT<name STRING, country_code STRING>>`; `cpc` is
 *  `ARRAY<STRUCT<code STRING, inventive BOOL, first BOOL, tree ARRAY<STRING>>>`
 *  with `first` marking the primary classification. */
export interface PatentRow {
  /** `US-10123456-B2`: country, number, kind. */
  publication_number: string;
  title: string | null;
  abstract: string | null;
  /** `yyyymmdd` as a number; the Node client returns INT64 as a JS number. */
  grant_date: number | string | null;
  assignees: (string | null)[];
  inventors: (string | null)[];
  /** The code whose `first` flag is set, or null when none is. */
  cpc_first: string | null;
  cpc: (string | null)[];
}

/** What `createQueryJob` is handed: the SQL, its named parameters, and the cap. */
export interface PatentQuery {
  sql: string;
  params: Record<string, unknown>;
  maximumBytesBilled: number;
}

export interface PatentResultPage {
  rows: PatentRow[];
  /** The token for the next page, or null when this was the last. */
  pageToken: string | null;
  totalBytesProcessed: number | null;
}

/** The two calls the search makes, so a test can run a fake. The real one
 *  (`bigqueryClient`) waits for the job to finish inside `createQueryJob`. */
export interface PatentJobClient {
  createQueryJob(query: PatentQuery): Promise<string>;
  getQueryResults(jobId: string, page: { maxResults: number; pageToken?: string }): Promise<PatentResultPage>;
}

type Env = Record<string, string | undefined>;

export const BIGQUERY_ENV = ["GOOGLE_CLOUD_PROJECT", "GOOGLE_APPLICATION_CREDENTIALS_JSON"] as const;

/** A client over the real BigQuery, or null when either variable is missing. */
export function bigqueryClient(env: Env = process.env): PatentJobClient | null {
  const projectId = env.GOOGLE_CLOUD_PROJECT?.trim();
  const json = env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim();
  if (!projectId || !json) return null;
  const bigquery = new BigQuery({ projectId, credentials: JSON.parse(json) as Record<string, string> });
  return {
    async createQueryJob({ sql, params, maximumBytesBilled }) {
      const [job] = await bigquery.createQueryJob({ query: sql, params, maximumBytesBilled: String(maximumBytesBilled), useLegacySql: false, location: LOCATION });
      // `getQueryResults` on a running job answers no rows and no error; wait
      // for the job here so every page read below is of a finished result set.
      await job.promise();
      return job.id!;
    },
    async getQueryResults(jobId, { maxResults, pageToken }) {
      const [rows, next, response] = await bigquery.job(jobId, { location: LOCATION }).getQueryResults({ maxResults, pageToken, autoPaginate: false });
      const processed = response?.totalBytesProcessed;
      return { rows: rows as PatentRow[], pageToken: next?.pageToken ?? null, totalBytesProcessed: processed == null ? null : Number(processed) };
    },
  };
}

/** `BIGQUERY_MAX_BYTES` as a positive whole number, or the default. */
export function bigqueryMaxBytes(env: Env = process.env): number {
  const n = Number(env.BIGQUERY_MAX_BYTES?.trim() || NaN);
  return Number.isInteger(n) && n > 0 ? n : BIGQUERY_MAX_BYTES_DEFAULT;
}

/** The select list and source every patent query shares. Column names and
 *  types are the ASSUMPTIONS listed on `PatentRow`. */
const SELECT = `select p.publication_number,
       (select text from unnest(p.title_localized) where language = 'en' limit 1) as title,
       (select text from unnest(p.abstract_localized) where language = 'en' limit 1) as abstract,
       p.grant_date,
       array(select name from unnest(p.assignee_harmonized)) as assignees,
       array(select name from unnest(p.inventor_harmonized)) as inventors,
       (select code from unnest(p.cpc) where first limit 1) as cpc_first,
       array(select code from unnest(p.cpc)) as cpc
from ${TABLE} p
where p.country_code = 'US'`;

/** The query lower-cased, every regex metacharacter escaped, and every run
 *  of whitespace a `\s+`, so a two-word query matches as a phrase. */
export function patternOf(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
}

/** Every granted US patent whose English title or abstract carries the
 *  query as a phrase, granted on or after `since` (a year; `@since` is
 *  `yyyymmdd`, as `grant_date` is), newest first on a stable order. */
export function patentQuery({ query, since }: { query: string; since?: number | null }, env: Env = process.env): PatentQuery {
  return {
    sql: `${SELECT} and p.grant_date >= @since and p.grant_date > 0
  and exists (select 1 from unnest(p.abstract_localized) a where a.language = 'en')
  and (regexp_contains(lower((select text from unnest(p.title_localized) where language = 'en' limit 1)), @pattern)
    or regexp_contains(lower((select text from unnest(p.abstract_localized) where language = 'en' limit 1)), @pattern))
order by p.grant_date desc, p.publication_number`,
    params: { since: since ? since * 10_000 + 101 : 0, pattern: patternOf(query) },
    maximumBytesBilled: bigqueryMaxBytes(env),
  };
}

/** The rows for a list of patent numbers (as `patentNumberOf` reads them):
 *  the middle segment of `US-10123456-B2` is the number. */
export function patentListQuery(numbers: string[], env: Env = process.env): PatentQuery {
  return {
    sql: `${SELECT} and split(p.publication_number, '-')[safe_offset(1)] in unnest(@numbers)
order by p.grant_date desc, p.publication_number`,
    params: { numbers },
    maximumBytesBilled: bigqueryMaxBytes(env),
  };
}

export function provenanceOfPatent(row: PatentRow): PatentProvenance {
  const number = row.publication_number ? patentNumberOf(row.publication_number) : null;
  const date = Number(row.grant_date);
  const present = (s: string | null | undefined): s is string => typeof s === "string" && s.length > 0;
  return {
    patent_number: number || null,
    url: number ? `https://patents.google.com/patent/US${number}` : null,
    assignees: (row.assignees ?? []).filter(present),
    inventors: (row.inventors ?? []).filter(present),
    cpc: [...new Set((row.cpc ?? []).filter(present))],
    year: Number.isInteger(date) && date > 0 ? Math.floor(date / 10_000) : null,
    field: cpcSectionName(row.cpc_first),
  };
}

function missingCredentials(env: Env): string {
  return `${BIGQUERY_ENV.filter((name) => !env[name]?.trim()).join(" and ")} not set: BigQuery runs no job without a billing project and a service account.`;
}

function clientOf(options: { client?: PatentJobClient; env?: Env }): PatentJobClient {
  const env = options.env ?? process.env;
  const client = options.client ?? bigqueryClient(env);
  if (!client) throw new Error(missingCredentials(env));
  return client;
}

/** `<job id>:<page token>`; a job id never holds a colon. */
function cursorOf(jobId: string, pageToken: string): string {
  return `${jobId}:${pageToken}`;
}

function parseCursor(cursor: string): { jobId: string; pageToken: string } {
  const at = cursor.indexOf(":");
  if (at <= 0 || at === cursor.length - 1) throw new Error(`not a patents cursor (<job id>:<page token>): ${cursor}`);
  return { jobId: cursor.slice(0, at), pageToken: cursor.slice(at + 1) };
}

export interface PatentSearchOptions {
  query: string;
  /** Earliest grant year. */
  since?: number | null;
  limit?: number;
  /** A printed cursor, `<job id>:<page token>`; null starts a new job. */
  cursor?: string | null;
  client?: PatentJobClient;
  /** Read for the credentials and `BIGQUERY_MAX_BYTES`; the process environment unless given. */
  env?: Env;
  pageSize?: number;
  onPage?: (page: { cursor: string; works: number }) => void;
  /** Called once, when the job's first page arrives, with what it scanned. */
  onJob?: (job: { jobId: string; totalBytesProcessed: number | null }) => void;
}

/** The BigQuery twin of `searchWorks`: one job, then its result set page by
 *  page, each patent handed to `onPatent` before the next page is asked for.
 *  Any failure stops the run with the cursor that would retry it. */
export async function searchPatents(
  options: PatentSearchOptions,
  onPatent: (row: PatentRow) => Promise<void>,
): Promise<SearchResult> {
  const client = clientOf(options);
  const limit = options.limit ?? Infinity;
  const pageSize = options.pageSize ?? PER_PAGE;
  let seen = 0;

  let jobId: string;
  let pageToken: string | undefined;
  if (options.cursor) {
    ({ jobId, pageToken } = parseCursor(options.cursor));
  } else {
    try {
      jobId = await client.createQueryJob(patentQuery(options, options.env));
    } catch (error) {
      return { seen, stopped: true, cursor: null, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  let reported = false;
  while (seen < limit) {
    const cursor = pageToken ? cursorOf(jobId, pageToken) : null;
    const size = Math.min(pageSize, limit - seen);
    let page: PatentResultPage;
    try {
      page = await client.getQueryResults(jobId, pageToken ? { maxResults: size, pageToken } : { maxResults: size });
    } catch (error) {
      return { seen, stopped: true, cursor, reason: error instanceof Error ? error.message : String(error) };
    }
    if (!reported) {
      reported = true;
      options.onJob?.({ jobId, totalBytesProcessed: page.totalBytesProcessed });
    }
    const rows = page.rows.slice(0, size);
    options.onPage?.({ cursor: cursor ?? "start", works: rows.length });
    for (const row of rows) {
      await onPatent(row);
      seen += 1;
    }
    if (!page.pageToken) return { seen, stopped: false, cursor: null };
    pageToken = page.pageToken;
  }
  return { seen, stopped: false, cursor: pageToken ? cursorOf(jobId, pageToken) : null };
}

/** A `fetchPatent` for a list of numbers that runs one job for all of them
 *  the first time it is asked, since a job per number would scan the table
 *  per number. A number the job did not return is null. */
export function patentFetcher(
  identifiers: string[],
  options: { client?: PatentJobClient; env?: Env; onJob?: PatentSearchOptions["onJob"] } = {},
): (identifier: string) => Promise<PatentRow | null> {
  let rows: Promise<Map<string, PatentRow>> | undefined;
  const load = async () => {
    const client = clientOf(options);
    const numbers = [...new Set(identifiers.map(patentNumberOf).filter((n) => n.length > 0))];
    const jobId = await client.createQueryJob(patentListQuery(numbers, options.env));
    const held = new Map<string, PatentRow>();
    let pageToken: string | undefined;
    do {
      const page = await client.getQueryResults(jobId, pageToken ? { maxResults: PER_PAGE, pageToken } : { maxResults: PER_PAGE });
      if (!pageToken) options.onJob?.({ jobId, totalBytesProcessed: page.totalBytesProcessed });
      for (const row of page.rows) held.set(patentNumberOf(row.publication_number), row);
      pageToken = page.pageToken ?? undefined;
    } while (pageToken);
    return held;
  };
  return async (identifier) => {
    rows ??= load();
    return (await rows).get(patentNumberOf(identifier)) ?? null;
  };
}

export interface PatentIngestResult {
  identifier: string;
  status: IngestStatus;
  artifactId?: string;
  textHash?: string;
  created?: boolean;
  sharedWith?: string;
  title?: string | null;
  provenance?: PatentProvenance;
}

export interface PatentIngestDeps {
  fetchPatent?: (identifier: string) => Promise<PatentRow | null>;
  /** Merged into the stored provenance — the query set a patent came from. */
  provenance?: Record<string, unknown>;
  /** As in `IngestDeps`: refuse a shorter abstract as `short_abstract`. */
  minWords?: number;
}

/** Fetch a patent, and write the `document` + `artifact_texts` pair. A
 *  number already stored is answered from its row before any request; a
 *  patent without an English abstract is `no_abstract` and writes nothing. */
export async function ingestPatent(db: Db, identifier: string, deps: PatentIngestDeps = {}): Promise<PatentIngestResult> {
  const held = await storedBySourceId(db, { patent_number: patentNumberOf(identifier) });
  if (held) return { identifier, status: "ok", ...held, created: false };

  const fetcher = deps.fetchPatent ?? patentFetcher([identifier]);
  const row = await fetcher(identifier);
  if (!row) return { identifier, status: "not_found" };

  const title = row.title ?? null;
  const provenance: PatentProvenance = { ...provenanceOfPatent(row), ...deps.provenance };
  const known = await storedBySourceId(db, provenance);
  if (known) return { identifier, status: "ok", ...known, created: false, title, provenance };

  const abstract = row.abstract ? normalize(row.abstract) : "";
  if (!abstract) return { identifier, status: "no_abstract" };
  if (wordCount(abstract) < (deps.minWords ?? 0)) return { identifier, status: "short_abstract", title, provenance };

  // Before the document row, as in `ingestWork`: a text already held means
  // this abstract has an artifact, and a second document would be an orphan.
  const textHash = hashText(abstract);
  const [shared] = await db
    .select({ artifactId: artifactTexts.artifactId })
    .from(artifactTexts)
    .where(eq(artifactTexts.textHash, textHash))
    .limit(1);
  if (shared) return { identifier, status: "ok", artifactId: shared.artifactId, textHash, created: false, sharedWith: shared.artifactId, title, provenance };

  // One transaction, as in `ingestWork`: a refused text leaves no document.
  const { row: doc, put } = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(document)
      .values({ sessionId: null, source: "patent", title, text: null })
      .returning({ id: document.id });
    return { row, put: await putArtifactText(tx, { artifactId: row.id, sourceFormat: "abstract", parser: PATENT_PARSER, text: abstract, provenance }) };
  });
  return { identifier, status: "ok", artifactId: doc.id, textHash: put.textHash, created: put.created, sharedWith: put.sharedWith, title, provenance };
}
