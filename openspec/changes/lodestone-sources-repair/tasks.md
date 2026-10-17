## 1. OpenAlex

- [x] 1.1 Failing tests: `workUrl` carries `api_key` when `OPENALEX_API_KEY` is set and `mailto` beside it; `searchUrl` already does, keep its test (2026-10-15: plus `searchWorks` hands `meta.notice` to an `onNotice` hook)
- [x] 1.2 `openalex.ts`: `workUrl(identifier, { mailto, apiKey })`; header comment stops saying keyless and polite pool
- [x] 1.3 `rate.ts`: `openalexLimiter()` returns 25/s with a key, 10/s without; test with a fake clock for both (2026-10-15: `openalexPerSecond`, `OPENALEX_KEYED_PER_SECOND = 25`; `searchWorks` defaults to it)
- [x] 1.4 `scripts/lodestone/ingest.mts`: use `openalexLimiter()`; print the ceiling; on the first response whose `meta.notice` names the shared budget, print it once (2026-10-15: 20-DOI keyed `--list` run — 20/20 requests 200 with `api_key`, no notice, 20 new and embedded; a keyed query paged past 200, two pages, no notice)
- [x] 1.5 `.env.example`: `OPENALEX_API_KEY` with one line on the $1/day budget; README "Run it" mentions it beside `VOYAGE_API_KEY`

## 2. Patents

- [ ] 2.0 Verify the `publications` schema in the BigQuery console: types of `grant_date`, shape of `cpc` (`first` flag), `abstract_localized`; fix `design.md` §3 if any differ (2026-10-17: no credentials on this machine, so not verified. The SQL is written against the design's columns and types; each assumption is listed on `PatentRow` in `bigquery-patents.ts` and on `SELECT` beneath it. Once a project exists: open `patents-public-data.patents.publications` in the console, check `grant_date INT64 yyyymmdd`, `cpc.first BOOL`, `abstract_localized.language`, and run the `patentQuery` SQL with `--dry_run` from `bq` to see the bytes it would scan)
- [x] 2.1 `npm i @google-cloud/bigquery`; `bigqueryClient()` builds from `GOOGLE_CLOUD_PROJECT` + `GOOGLE_APPLICATION_CREDENTIALS_JSON` or returns null (2026-10-17: `@google-cloud/bigquery` ^9.3.0; `bigqueryClient(env)` waits for the job inside `createQueryJob`, since `getQueryResults` on a running job answers no rows)
- [x] 2.2 Failing tests for `bigquery-patents.ts` with a fake job client: the SQL carries `@since` as `yyyymmdd`, `@pattern`; `maximumBytesBilled` is set; a row becomes a `document` with `source = "patent"` and provenance `{ patent_number, url, assignees, inventors, cpc, year, field }` with `field` from `cpc_first`; a row with no English abstract is `no_abstract`; the cursor is the page token (2026-10-17: the cursor is `<job id>:<page token>`, since a token means nothing outside its job; `@pattern` also escapes regex metacharacters; `BIGQUERY_MAX_BYTES` read from an injected env)
- [x] 2.3 Failing tests for the new `patentNumberOf` in `patents.ts`: `US-10123456-B2`, `US10123456B2`, `10123456`, `US-RE48123-E` → the number (2026-10-17: plus the pasted forms the old parser took)
- [x] 2.4 Implement `bigquery-patents.ts`: `searchPatents(options, onPatent)` returning `SearchResult`, one job then `getQueryResults` pages; `ingestPatent` moves here unchanged from `patentsview.ts`; `cpcSectionName` and `patentNumberOf` in `patents.ts` (2026-10-17: `PATENT_PARSER` is `google-patents-abstract-v1`, as the text now comes from `abstract_localized`; no patent rows existed under the old name. `--list` runs one job for the whole list through `patentFetcher`, never one per number)
- [x] 2.5 Delete `patentsview.ts` and `patentsview.test.ts`; remove `PATENTSVIEW_PER_MINUTE` from `rate.ts`; `ingest.mts` `--source patents` uses the new module and refuses without both variables (2026-10-17: names the missing variable(s), exits 1 before opening the database)
- [x] 2.6 `.env.example`: `GOOGLE_CLOUD_PROJECT`, `GOOGLE_APPLICATION_CREDENTIALS_JSON`, `BIGQUERY_MAX_BYTES` replace `PATENTSVIEW_API_KEY` (2026-10-17: default cap 214748364800 bytes, 200 GiB)
- [ ] 2.7 One real run: `--source patents --query "cold chain sensor" --since 2018 --limit 100`; note bytes processed and cost in the task (2026-10-17: waits on a billing project and a service-account key. With both in `.env.local`, run exactly that command; the `# BigQuery job … bytes processed` line is the number to record, at $6.25 per TiB on demand)

## 3. Docs

- [x] 3.1 README, `docs/api.md`, `docs/next-steps.md` Phase 4: no "polite pool", no "PatentsView" outside history (2026-10-17: `docs/api.md` never named either; README names the BigQuery variables; next-steps keeps one historical line)
- [x] 3.2 `openspec/changes/lodestone-corpus-ingest/design.md` decision 4: one supersession line (2026-10-17)
- [x] 3.3 `npm run typecheck`; `npx vitest run src/harness/papers` green (2026-10-17: 7 files, 79 tests; typecheck clean; `src/lodestone/network.test.ts` still ranks a patent with the unchanged provenance)
