## 0. Gate

- [x] 0.1 `lodestone-sources-repair` merged (keyed OpenAlex, limiter by key); `lodestone-eval-set` baseline recorded with `--no-search`

## 1. Sources

- [x] 1.1 Failing tests with a fake `fetch`: `searchUrl({ semantic: true })` carries `search.semantic`, no `search`, `per-page=50` and `api_key`; `searchWorks` with `semantic: true` returns up to 50 works and spaces at 1/s under a fake clock; a 429 returns `{ stopped: true }`
- [x] 1.2 `search.ts`: the `semantic` option (2026-10-16: semantic refuses a cursor; one page, no cursor param)
- [x] 1.3 Failing tests for `s2.ts`: URL fields, `x-api-key`, a paper with a DOI yields `{ doi, tldr }`, one without is reported `skipped_no_doi`
- [x] 1.4 `src/harness/papers/s2.ts`: `searchS2`, 1/s limiter; resolution through `fetchWork` → `ingestWork`; the TLDR handed to the ingest as provenance `tldr` for `lodestone-hit-sentences` to use (2026-10-16: `s2.ts` searches only; `searchCard` does the ingest. The key is optional: a keyless call got 429 from the shared pool)
- [x] 1.5 Migration `0015_card_search`: table `card_search`

## 2. The search

- [x] 2.1 `src/lodestone/search.ts`: `queryFor(block, entries, purpose)` → `{ semantic, keyword }`; tests for trimming to 2,000 characters, purpose leading, no purpose
- [x] 2.2 `blockHashes(doc)` keyed by block key; `plannedBlocks(db, ideaId, doc)` returns changed blocks and rows `running` past five minutes, deletes rows for emptied blocks; test
- [x] 2.3 `searchCard(db, ideaId)`: per planned block, the three sources in order under their limiters; `ingestWork` with provenance from the allowlist only and `query_set = "card-search"`; `embedPaperAbstracts`; write `card_search` rows with `sources` and `found`; errors land in `sources.<name>.error`, never thrown
- [x] 2.4 `importCard` callers (`POST /api/lodestone/cards`, the import form action) call `after(() => searchCard(db, ideaId))`; both routes export `maxDuration = 300`; the `POST` body gains `search: "queued"` (2026-10-16: the action's `maxDuration` sits on `src/app/lodestone/page.tsx`, the page that uses it, per the Next docs)
- [x] 2.5 `searchState(db, ideaId)` folded for `GET /api/lodestone/cards/<id>`: `{ state, finishedAt, sources, found, abstracted }`; no rows → `done`, `found: 0` (2026-10-16: `searchState(db, ideaId, doc)` reads `abstracted` from the doc it is handed)
- [x] 2.6 `forge-idea/5` accepted by the import zod schema with `purpose: { l1, l2 }` and extra keys stripped; a test reads a published `/5` card as another member and finds no `purpose`
- [x] 2.7 Route test: `GET /papers/<id>` for a searched-in document has provenance keys within the allowlist and no `query`
- [x] 2.8 `digest.ts`: the `since` window excludes `query_set = 'card-search'`; test
- [x] 2.9 `docs/api.md`: `forge-idea/5` and `purpose`; the `search` field on `POST` and `GET`; the sentence on card text sent to OpenAlex and Semantic Scholar; the licences (OpenAlex CC0, S2 ODC-BY with attribution)

## 3. Field quota and block keys

- [x] 3.1 Failing tests: `fieldQuota` on a hand-built list (cap, null bucket, short list); `scorePaper` path and `priorArtFor` agree on the eval cards; `hitFrom` returns `blockKeys` aligned with `blocks` (2026-10-16: the agreement is checked on the network cohort, whose corpus has fields; `priorArtFor` takes `{ perField }`, `Infinity` for the eval's no-quota rows)
- [x] 3.2 `fieldQuota(hits, k, perField = 3)` and `blockKeys` in `priorArt.ts`; `priorArtFor` requests `3k` from SQL and applies it; `scorePaper` callers apply it
- [x] 3.3 `network.test.ts`: a cohort fixture where one field dominates
- [x] 3.4 `docs/api.md`: `blockKeys` on a hit; clients send `blockKeys` in a verdict's `context`

## 4. Eval

- [ ] 4.1 `npm run lodestone:eval -- --label search` with search on (the runner imports through `importCard`): record MRR of marked documents, mean distinct fields, and P@5 for the record
- [ ] 4.2 `--label quota --no-search`; `--label purpose` with the ten cross-field cards carrying purposes
- [ ] 4.3 Write the three rows beside the baseline here; accept when mean fields ≥ baseline + 1, marked-document MRR ≥ half the baseline (0.251), and at least half of the searched-in papers in the top five of ten sampled cards are judged relevant (design §9); otherwise try `6k` candidates or adjust the query builder and re-run

### Eval rows so far (2026-10-16; not accepted)

| run | search | quota | purpose | P@5 | R@10 | MRR (marks) | fields |
|---|---|---|---|---|---|---|---|
| baseline | off | off | off | 0.207 | 0.517 | 0.502 | 4.63 |
| `quota` | off | on | off | 0.200 | 0.461 | 0.496 | 5.60 |
| `search` | on, unfiltered | off | off | 0.000 | 0.017 | 0.004 | 3.60 |
| `search` (2026-10-17) | on, scholarly | off | off | 0.007 | 0.017 | 0.033 | 3.83 |
| `purpose` (2026-10-17) | on, scholarly | on | on, ten cross-field cards | 0.007 | 0.017 | 0.008 | 5.07 |

- `search` added ~11,300 documents, all from OpenAlex: Semantic Scholar answered 429 to every keyless call. The top tens filled with library guides, annual reports and repository copies that OpenAlex types `article`. Searches now keep to articles and reviews in a journal or conference (`scholarly`: an OpenAlex filter on keyword search, a source check in `searchCard` for semantic hits, which OpenAlex filters by type only).
- The filtered re-run ran out of the OpenAlex key's daily budget after 24 of 30 cards and is not a row. Re-run after the budget resets: copy `data/pglite-eval` to `data/pglite-eval-search` first, then `--data pglite-eval-search --no-quota --label search`, then `purpose` on a fresh copy with `--purpose`.
- 2026-10-17: both filtered runs completed all thirty cards within the key's budget (`results/2026-10-17-search.md`; `results/2026-10-18-purpose.md`, named for the UTC date it finished). Semantic Scholar stayed keyless and answered 429 to most calls (83 documents got through in `search`, 87 in `purpose`); OpenAlex semantic tripped its own 1/s limit on one block in `search` and two in `purpose` ("heavy load" rationing on the second). `search` added 8,198 documents, `purpose` 8,407. Against the gate in 4.3: fields 3.83 and 5.07 against a floor of 5.63; marked MRR 0.033 and 0.008 against 0.251; the judged sample (`results/2026-10-17-search-judged.md`, Claude's calls, every third card) found 13 of 48 searched-in top-five papers relevant, 27%, or 23 of 48 counting every borderline case. All three gates fail. The judged file names the cause: `scholarly` keeps out guides and reports but not newsletters, magazine columns, syllabi, law notes and photo captions typed `article` in a journal source, and the embedder places those beside the card on shared everyday vocabulary. Not formally judged, but visible in the `purpose` copy: purposes sharpen the cross-field cards' top fives (tumbler's holds three reusable-cup studies above its mark, nook's four overbooking papers), so the query builder is the lever; the noise is in what the sources return for the firms cards.
- The MRR gate counts every searched-in paper as unmarked, so a relevant find pushes the marks down exactly as noise does: search can pass it only by adding nothing that outranks the marks. Decided the same day: the gate is now fields + 1, marked MRR ≥ half the baseline as a noise floor, and a judged sample of the searched-in hits (4.3, design §9).
