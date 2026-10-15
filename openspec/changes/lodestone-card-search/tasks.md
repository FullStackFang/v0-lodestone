## 0. Gate

- [ ] 0.1 `lodestone-sources-repair` merged (keyed OpenAlex, limiter by key); `lodestone-eval-set` baseline recorded with `--no-search`

## 1. Sources

- [ ] 1.1 Failing tests with a fake `fetch`: `searchUrl({ semantic: true })` carries `search.semantic`, no `search`, `per-page=50` and `api_key`; `searchWorks` with `semantic: true` returns up to 50 works and spaces at 1/s under a fake clock; a 429 returns `{ stopped: true }`
- [ ] 1.2 `search.ts`: the `semantic` option
- [ ] 1.3 Failing tests for `s2.ts`: URL fields, `x-api-key`, a paper with a DOI yields `{ doi, tldr }`, one without is reported `skipped_no_doi`
- [ ] 1.4 `src/harness/papers/s2.ts`: `searchS2`, 1/s limiter; resolution through `fetchWork` → `ingestWork`; the TLDR handed to the ingest as provenance `tldr` for `lodestone-hit-sentences` to use
- [ ] 1.5 Migration `0015_card_search`: table `card_search`

## 2. The search

- [ ] 2.1 `src/lodestone/search.ts`: `queryFor(block, entries, purpose)` → `{ semantic, keyword }`; tests for trimming to 2,000 characters, purpose leading, no purpose
- [ ] 2.2 `blockHashes(doc)` keyed by block key; `plannedBlocks(db, ideaId, doc)` returns changed blocks and rows `running` past five minutes, deletes rows for emptied blocks; test
- [ ] 2.3 `searchCard(db, ideaId)`: per planned block, the three sources in order under their limiters; `ingestWork` with provenance from the allowlist only and `query_set = "card-search"`; `embedPaperAbstracts`; write `card_search` rows with `sources` and `found`; errors land in `sources.<name>.error`, never thrown
- [ ] 2.4 `importCard` callers (`POST /api/lodestone/cards`, the import form action) call `after(() => searchCard(db, ideaId))`; both routes export `maxDuration = 300`; the `POST` body gains `search: "queued"`
- [ ] 2.5 `searchState(db, ideaId)` folded for `GET /api/lodestone/cards/<id>`: `{ state, finishedAt, sources, found, abstracted }`; no rows → `done`, `found: 0`
- [ ] 2.6 `forge-idea/5` accepted by the import zod schema with `purpose: { l1, l2 }` and extra keys stripped; a test reads a published `/5` card as another member and finds no `purpose`
- [ ] 2.7 Route test: `GET /papers/<id>` for a searched-in document has provenance keys within the allowlist and no `query`
- [ ] 2.8 `digest.ts`: the `since` window excludes `query_set = 'card-search'`; test
- [ ] 2.9 `docs/api.md`: `forge-idea/5` and `purpose`; the `search` field on `POST` and `GET`; the sentence on card text sent to OpenAlex and Semantic Scholar; the licences (OpenAlex CC0, S2 ODC-BY with attribution)

## 3. Field quota and block keys

- [ ] 3.1 Failing tests: `fieldQuota` on a hand-built list (cap, null bucket, short list); `scorePaper` path and `priorArtFor` agree on the eval cards; `hitFrom` returns `blockKeys` aligned with `blocks`
- [ ] 3.2 `fieldQuota(hits, k, perField = 3)` and `blockKeys` in `priorArt.ts`; `priorArtFor` requests `3k` from SQL and applies it; `scorePaper` callers apply it
- [ ] 3.3 `network.test.ts`: a cohort fixture where one field dominates
- [ ] 3.4 `docs/api.md`: `blockKeys` on a hit; clients send `blockKeys` in a verdict's `context`

## 4. Eval

- [ ] 4.1 `npm run lodestone:eval -- --label search` with search on (the runner imports through `importCard`): record MRR of marked documents, mean distinct fields, and P@5 for the record
- [ ] 4.2 `--label quota --no-search`; `--label purpose` with the ten cross-field cards carrying purposes
- [ ] 4.3 Write the three rows beside the baseline here; accept when marked-document MRR ≥ baseline and mean fields ≥ baseline + 1; otherwise try `6k` candidates or adjust the query builder and re-run
