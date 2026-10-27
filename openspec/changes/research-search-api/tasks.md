## 1. The route

- [x] 1.1 Write failing tests in `src/app/api/lodestone/routes.test.ts` for the spec's scenarios:
  - 401 without a token
  - 400 on an empty body, on `q` with 5 strings, and on `k` of 0 and of 51
  - set-filtered hits nearest first; an unknown set gives `hits: []`
  - two sub-claims merged once each
  - null metrics
  - `openalex` null when not asked for
  - `openalex: true` writing nothing, with `stopped` a list
  - 503 when the embedder cannot embed; 502 when it throws

  The file's `embed` mock always embeds, so give it a switch the tests set (keyless,
  throwing). The route has no injection seam for OpenAlex, so stub `fetch` with
  `vi.stubGlobal`, or mock `@/harness/research/search`'s `openalexHits`.
- [x] 1.2 Add `src/app/api/lodestone/papers/search/route.ts`:
  - `POST` behind `withToken`, with a zod body schema; `q` normalised to an array first
  - questions searched in parallel through `searchPapers`
  - when asked, `openalexHits` for each question, sharing one `openalexSemanticLimiter()`
    passed as `wait`
  - lists merged with `mergeHits`
  - embedding failures caught in the route: no key → 503, any other throw → 502
  - `dynamic = "force-dynamic"`, `maxDuration = 300`
  - *Found while building:* `limiter()` released callers that waited at the same time
    together, so a shared limiter did not space parallel questions. It now queues callers;
    `rate.test.ts` covers it.
- [x] 1.3 Correct the "CC0 or public domain" comment in `papers/[documentId]/route.ts`, and
  write the licensing gate into the search route's header comment: no key outside the pilot
  until the NeurIPS abstracts are cleared or cut to excerpts.
- [x] 1.4 Run `npm test` and `npm run typecheck`: everything green.

## 2. Release

- [ ] 2.1 Merge to master and push. Confirm the Vercel deployment for the merge commit
  succeeds.
- [x] 2.2 Make `scripts/lodestone/ingest.mts` print the database host, or `PGlite <dir>`,
  before it opens the database. Confirm that a shell-set `DATABASE_URL` wins over
  `.env.local` by checking that print.
- [ ] 2.3 Run `npm run db:migrate` against production's unpooled URL. Record the host it
  printed, and that `0020` applied.
- [ ] 2.4 Measure production `pg_database_size` and the Neon plan's limit. Record both. If
  the estimated 200–300 MB does not fit, stop and ask the author: upgrade the plan or load
  a subset by year.
- [ ] 2.5 Run `lodestone:ingest --source xlsx --file <sheet> --set neurips-2021-2026`
  against production. Expect 1–2 hours.
  - Check that the printed host is production before it gets going.
  - Record the new, existing, no_text and embedded counts.
  - Confirm there are 0 rows without a vector.
- [ ] 2.6 Smoke check on the live URL with the author's token: POST
  `{ q: "LLM recommendations popularity bias", k: 10, set: "neurips-2021-2026" }`. Record
  the status, the hit count and the time. Expect 200 and 10 hits.
- [ ] 2.7 Update the `research-review` skill to say the search is also at
  `POST /api/lodestone/papers/search`, with the same hit shape.
