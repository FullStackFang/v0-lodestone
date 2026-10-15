## Context

`src/harness/papers/` holds three fetchers — `openalex.ts` (one work),
`search.ts` (a query, paged by cursor), `patentsview.ts` (a query, paged by
cursor) — and `rate.ts`, which spaces requests under a published ceiling.
`ingest.ts` turns a fetched work or patent into rows. Everything downstream
reads rows and provenance, never a source.

## Decisions

### 1. One key, read in one place, sent by both URL builders

`workUrl` grows an `apiKey` parameter defaulting to `OPENALEX_API_KEY`, as
`searchUrl` already has. The two stay separate functions because a work URL
and a search URL differ in path and filter, but they read the same two env
vars. No module other than these two ever composes an OpenAlex URL; the test
for each asserts `api_key` is present when the env var is.

### 2. The limiter is chosen from the key, not configured

`openalexLimiter()` returns `limiter(25, 1000)` when a key is set and
`limiter(10, 1000)` otherwise. 25 leaves headroom under 30 for the eval
runner and an ingest to overlap. The command prints which ceiling it is
running under, beside the existing `VOYAGE_API_KEY` line.

### 3. BigQuery: one job per query, paged by result token, billed by column

`@google-cloud/bigquery` is the dependency, constructed as `new BigQuery({
projectId: GOOGLE_CLOUD_PROJECT, credentials: JSON.parse(GOOGLE_APPLICATION_CREDENTIALS_JSON) })`;
a billing project is mandatory, so both variables are. The module exposes
`searchPatents(options, onPatent)` with the same `SearchResult` shape
(`{ stopped, cursor }`) the command already handles. The client is injected
as `{ createQueryJob, getQueryResults }` so the tests run a fake and never
touch BigQuery.

`patents-public-data.patents.publications` is not partitioned and BigQuery
bills by the columns read over the whole table, so a `WHERE` on
`country_code` or `grant_date` bounds nothing. Reading `title_localized` and
`abstract_localized` is on the order of a hundred gigabytes a query, under a
dollar at list price, and a `LIMIT/OFFSET` loop would pay that per page.
So: one job per operator query, its result set paged with
`job.getQueryResults({ maxResults, pageToken })`, the cursor being the page
token; `maximumBytesBilled` set from `BIGQUERY_MAX_BYTES` (default 200 GB) so
a mistaken query fails instead of billing; `totalBytesProcessed` printed once
when the job completes. Date columns are `INT64` as `yyyymmdd` (UNVERIFIED
against Google's schema page, which could not be fetched; verify in task 2.0
before writing the test), so `@since` is `20180101`, not a year.

```sql
select p.publication_number,
       (select text from unnest(p.title_localized) where language = 'en' limit 1) as title,
       (select text from unnest(p.abstract_localized) where language = 'en' limit 1) as abstract,
       p.grant_date,
       array(select name from unnest(p.assignee_harmonized)) as assignees,
       array(select name from unnest(p.inventor_harmonized)) as inventors,
       (select code from unnest(p.cpc) where first limit 1) as cpc_first,
       array(select code from unnest(p.cpc)) as cpc
from `patents-public-data.patents.publications` p
where p.country_code = 'US' and p.grant_date >= @since
  and exists (select 1 from unnest(p.abstract_localized) a where a.language = 'en')
  and (regexp_contains(lower((select text from unnest(p.title_localized) where language = 'en' limit 1)), @pattern)
    or regexp_contains(lower((select text from unnest(p.abstract_localized) where language = 'en' limit 1)), @pattern))
order by p.grant_date desc, p.publication_number
```

`@pattern` is the query lower-cased with every run of whitespace turned into
`\s+`, so a two-word query matches as a phrase. `field` comes from
`cpc_first`, the code BigQuery marks as the primary classification; array
order is not primary-first.

### 4. `patent_number` is the publication number without country and kind

A new `patentNumberOf` in `patents.ts`: split on `-`, drop a leading
two-letter country and a trailing kind code (`[A-Z]\d?`), keep the digits;
also accept the bare and `US10123456B2` forms the old parser handled.
`US-10123456-B2` becomes `10123456`, matching what PatentsView wrote and what
the `0013` partial unique index already keys on, so a patent ingested under
the old source and the same patent under the new one are one row. The old
regex chain in `patentsview.ts` cannot parse the hyphenated form and is not
moved.

### 5. CPC section to field, unchanged

`cpcSectionName` moves out of `patentsview.ts` into `patents.ts` (shared) and
keeps its eight names. `field` for a patent is still the section of its first
CPC code.

### 6. The dead module is deleted, not kept behind a flag

`patentsview.ts` and its test go. The ingest change's `design.md` gets one
line under its decision 4: "Superseded 2026-10 by `lodestone-sources-repair`:
PatentsView shut down; patents come from BigQuery." The git history holds
the old code.
