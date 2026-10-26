## 1. The route

- [ ] 1.1 Write failing tests in `src/app/api/lodestone/routes.test.ts` for the spec's scenarios:
  - 401 without a token
  - 400 on `q` with 5 strings, and on `k` of 0 and of 51
  - set-filtered hits nearest first
  - two sub-claims merged once each
  - null metrics
  - `openalex` null when not asked for
  - `openalex: true` with a fake fetch, writing nothing
  - 503 when the embedder cannot embed

  Use the test embedder, which the file already mocks in.
- [ ] 1.2 Add `src/app/api/lodestone/papers/search/route.ts`:
  - `POST` behind `withToken`, with a zod body schema
  - questions run in parallel through `searchPapers`, plus `openalexHits` when asked
  - lists merged with `mergeHits`
  - the no-key throw mapped to 503 before `withToken`'s 400 mapping
  - `dynamic = "force-dynamic"`
- [ ] 1.3 Correct the "CC0 or public domain" comment in `papers/[documentId]/route.ts`, and
  write the licensing gate into the search route's header comment: no key outside the pilot
  until the NeurIPS abstracts are cleared or cut to excerpts.
- [ ] 1.4 Run `npm test` and `npm run typecheck`: everything green.

## 2. Release

- [ ] 2.1 Merge to master and push. Confirm the Vercel deployment for the merge commit
  succeeds.
- [ ] 2.2 Confirm that a shell-set `DATABASE_URL` wins over `.env.local` in tsx scripts:
  `process.loadEnvFile` does not override. Prove it with a dry print of the host.
- [ ] 2.3 Run `npm run db:migrate` against production's unpooled URL. Record the host it
  printed, and that `0020` applied.
- [ ] 2.4 Measure production `pg_database_size` and the Neon plan's limit. Record both. If
  the estimated 200–300 MB does not fit, stop and ask the author: upgrade the plan or load
  a subset by year.
- [ ] 2.5 Run `lodestone:ingest --source xlsx --file <sheet> --set neurips-2021-2026`
  against production. Record new, existing, no_text and embedded counts, and confirm there
  are 0 rows without a vector.
- [ ] 2.6 Smoke check on the live URL with the author's token: POST
  `{ q: "LLM recommendations popularity bias", k: 10, set: "neurips-2021-2026" }`. Record
  the status, the hit count and the time. Expect 200 and 10 hits.
- [ ] 2.7 Update the `research-review` skill to say the search is also at
  `POST /api/lodestone/papers/search`, with the same hit shape.
