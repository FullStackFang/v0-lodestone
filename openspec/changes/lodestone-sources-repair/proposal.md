## Why

Both of Lodestone's corpus sources moved under it between the ingest change
and today (probed 2026-10-15).

OpenAlex no longer has a polite pool. Every keyless request shares a $0.10 a
day budget with everyone on the same IP, and the response says so in
`meta.notice`. A free key carries its own $1 a day and 30 requests a second.
`search.ts` already sends `OPENALEX_API_KEY` when set; `openalex.ts`, the
single-work lookup every `--list` ingest and every eval mark goes through,
still sends only `mailto`, and `rate.ts` still spaces to the keyless 10 a
second. On a Vercel function sharing egress with strangers, the keyless
budget is gone before the first page.

PatentsView is gone. `search.patentsview.org` does not resolve;
`patentsview.org` redirects to a USPTO transition page. `patentsview.ts`, its
tests, the `--source patents` path and `PATENTSVIEW_PER_MINUTE` describe a
service that no longer answers. Of the replacements, Google Patents Public
Datasets on BigQuery is the one with abstracts, CPC codes and an embedding
column in one place, queryable by SQL, paid per byte scanned. EPO OPS is 4 GB
a week free but has no CPC-section field in the same call; USPTO's Open Data
Portal needs a key whose limits are unpublished.

## What Changes

- **The key on every OpenAlex request.** `workUrl` and `searchUrl` take
  `apiKey` from `OPENALEX_API_KEY` and send it; `mailto` stays, as OpenAlex
  still asks for it. `OPENALEX_PER_SECOND` becomes 25 when a key is present
  (under the 30 ceiling) and stays 10 without one. A response whose
  `meta.notice` mentions the shared budget is logged once per run so a
  missing key is visible, not silent.
- **Patents from BigQuery.** `patentsview.ts` is replaced by
  `bigquery-patents.ts`: a parameterised SQL over
  `patents-public-data.patents.publications` selecting publication number,
  title, abstract (English, `abstract_localized`), grant date, assignees,
  inventors and CPC codes for granted US patents matching a search string
  and an earliest year, paged by `LIMIT`/`OFFSET` on a stable order. The
  provenance shape (`patent_number`, `url`, `assignees`, `inventors`, `cpc`,
  `year`, `field`) does not change, so `priorArt.ts`, `digest.ts` and the
  read endpoint do not change.
- **Credentials.** `GOOGLE_CLOUD_PROJECT` (the billing project) and
  `GOOGLE_APPLICATION_CREDENTIALS_JSON` (a service account with BigQuery
  job-user) replace `PATENTSVIEW_API_KEY` in `.env.example`, with
  `BIGQUERY_MAX_BYTES` as a cap. Without them `--source patents` says so and
  stops, as it does today without the PatentsView key.
- **Docs.** README and `docs/api.md` stop saying "polite pool" and
  "PatentsView"; the ingest change's design note on PatentsView gets a
  one-line supersession pointer.

## Capabilities

### Modified Capabilities
- `corpus-ingest` (from `lodestone-corpus-ingest`): OpenAlex requests carry
  a key; the patent source is Google Patents on BigQuery.

## Non-goals

- No semantic search yet. That is `lodestone-card-search`; this change only
  keeps the two existing paths answering.
- No bulk patent load. The BigQuery path serves the same query-by-query
  ingest the command runs today. Each query scans the whole table's title
  and abstract columns (the table is not partitioned), so one job per query
  and a bytes-billed cap, never a page-by-page re-query.
- EPO and USPTO ODP are not added. One patent source, as before.
