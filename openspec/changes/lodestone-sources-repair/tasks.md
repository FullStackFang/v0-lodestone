## 1. OpenAlex

- [ ] 1.1 Failing tests: `workUrl` carries `api_key` when `OPENALEX_API_KEY` is set and `mailto` beside it; `searchUrl` already does, keep its test
- [ ] 1.2 `openalex.ts`: `workUrl(identifier, { mailto, apiKey })`; header comment stops saying keyless and polite pool
- [ ] 1.3 `rate.ts`: `openalexLimiter()` returns 25/s with a key, 10/s without; test with a fake clock for both
- [ ] 1.4 `scripts/lodestone/ingest.mts`: use `openalexLimiter()`; print the ceiling; on the first response whose `meta.notice` names the shared budget, print it once
- [ ] 1.5 `.env.example`: `OPENALEX_API_KEY` with one line on the $1/day budget; README "Run it" mentions it beside `VOYAGE_API_KEY`

## 2. Patents

- [ ] 2.0 Verify the `publications` schema in the BigQuery console: types of `grant_date`, shape of `cpc` (`first` flag), `abstract_localized`; fix `design.md` §3 if any differ
- [ ] 2.1 `npm i @google-cloud/bigquery`; `bigqueryClient()` builds from `GOOGLE_CLOUD_PROJECT` + `GOOGLE_APPLICATION_CREDENTIALS_JSON` or returns null
- [ ] 2.2 Failing tests for `bigquery-patents.ts` with a fake job client: the SQL carries `@since` as `yyyymmdd`, `@pattern`; `maximumBytesBilled` is set; a row becomes a `document` with `source = "patent"` and provenance `{ patent_number, url, assignees, inventors, cpc, year, field }` with `field` from `cpc_first`; a row with no English abstract is `no_abstract`; the cursor is the page token
- [ ] 2.3 Failing tests for the new `patentNumberOf` in `patents.ts`: `US-10123456-B2`, `US10123456B2`, `10123456`, `US-RE48123-E` → the number
- [ ] 2.4 Implement `bigquery-patents.ts`: `searchPatents(options, onPatent)` returning `SearchResult`, one job then `getQueryResults` pages; `ingestPatent` moves here unchanged from `patentsview.ts`; `cpcSectionName` and `patentNumberOf` in `patents.ts`
- [ ] 2.5 Delete `patentsview.ts` and `patentsview.test.ts`; remove `PATENTSVIEW_PER_MINUTE` from `rate.ts`; `ingest.mts` `--source patents` uses the new module and refuses without both variables
- [ ] 2.6 `.env.example`: `GOOGLE_CLOUD_PROJECT`, `GOOGLE_APPLICATION_CREDENTIALS_JSON`, `BIGQUERY_MAX_BYTES` replace `PATENTSVIEW_API_KEY`
- [ ] 2.7 One real run: `--source patents --query "cold chain sensor" --since 2018 --limit 100`; note bytes processed and cost in the task

## 3. Docs

- [ ] 3.1 README, `docs/api.md`, `docs/next-steps.md` Phase 4: no "polite pool", no "PatentsView" outside history
- [ ] 3.2 `openspec/changes/lodestone-corpus-ingest/design.md` decision 4: one supersession line
- [ ] 3.3 `npm run typecheck`; `npx vitest run src/harness/papers` green
