## 1. Restore the per-work ingest

- [x] 1.1 Copy `openalex.ts`, `openalex.test.ts`, `ingest.ts`, `ingest.test.ts` from `../v0-whetstone/whetstone/src/harness/papers/` into `src/harness/papers/`; fix the `@/` imports; `npx vitest run src/harness/papers` green
- [x] 1.2 Add `OPENALEX_MAILTO` back to `.env.example` with one line on the polite pool

## 2. Sources

- [x] 2.1 Migration `0013_corpus_sources`: add `patent` to `document_source`; partial unique indexes on `artifact_texts (provenance->>'openalex_id')`, `(provenance->>'doi')`, `(provenance->>'patent_number')`; `db:migrate` applies it to an empty Postgres and PGlite (2026-10-15: pgvector/pg17, 14 migrations; PGlite by the test suite)
- [x] 2.2 Write failing tests for `searchWorks` with a fake `fetch`: two pages by cursor, `has_abstract` and `from_publication_date` in the filter, `mailto` present, a 429 returns `{ stopped: true, cursor }` without throwing
- [x] 2.3 Implement `src/harness/papers/search.ts`
- [x] 2.4 Write failing tests for `patentsview.ts`: the query body shape, `X-Api-Key` header, a patent becomes a `document` with `source = "patent"` and provenance `{ patent_number, url, assignees, inventors, cpc, year, field }`, CPC section → field name, a patent without an abstract is `no_abstract`
- [x] 2.5 Implement `src/harness/papers/patentsview.ts` with `ingestPatent` mirroring `ingestWork`
- [x] 2.6 Test that a second `ingestWork` / `ingestPatent` of the same id writes nothing and reports `created: false` — checked by provenance key before any insert

## 3. The command

- [x] 3.1 `scripts/lodestone/ingest.mts`: flags `--source`, `--query`, `--since`, `--limit`, `--set`, `--cursor`, `--list <file>`; honours `DATABASE_URL`; one line per work; ends with `embedPaperAbstracts`; prints the cursor on stop and exits 2
- [x] 3.2 Widen `embedPaperAbstracts` to `source in ('paper','patent')`; test
- [x] 3.3 `package.json`: `lodestone:ingest`; `PATENTSVIEW_API_KEY` in `.env.example`
- [x] 3.4 Rate limiting: OpenAlex 10 req/s polite ceiling, PatentsView 45 req/min; a test with a fake clock

## 4. Ranking and the API

- [x] 4.1 `priorArt.ts`: `papers()` reads both sources; `PaperHit` gains `kind` and `querySet`; `scorePaper` fills them; `network.test.ts` covers a patent hit
- [x] 4.2 `digest.ts`: a patent row says "Patent" before its title
- [x] 4.3 Route `GET /api/lodestone/papers/[documentId]`: any valid token; 404 for an id that is not a paper or patent; body `{ documentId, kind, title, abstract, provenance, citation }`; `routes.test.ts` covers 200, 401, 404
- [x] 4.4 `docs/api.md`: `kind`, `querySet` on a hit; the new route

## 5. Surfaces

- [x] 5.1 `/lodestone/map`: per-source counts, the query sets with counts, the newest `document.createdAt`; `map.ts` exposes `corpusSummary(db)`; test
- [x] 5.2 Card page prior-art rows: "Patent" eyebrow and the query set in the meta line

## 6. The retune

- [ ] 6.1 Run `lodestone:ingest` for two query sets (one per source) against a dev database; record the counts in `evals/lodestone/thresholds.md`
- [x] 6.2 Sample 20 cards × top 5 hits; mark each relevant or not; compute precision at 5; choose `CLOSE` and `PAPER_FLOOR`; write it down with the `card_feedback` counts beside it
- [x] 6.3 Change the two constants in `geometry.ts` and `digest.ts` to the chosen values, or record why they stay

## 7. Accept

- [x] 7.1 One ingest of 500 works completes; the re-run adds zero rows (2026-10-15: "student housing rental market" since 2015 — 477 new, 6 shared by text hash, 17 short_abstract, all embedded; re-run 0 new)
- [x] 7.2 Killing the run mid-embed and re-running leaves no document without a vector
- [x] 7.3 A seeded card with a known near neighbour returns it in the top 3
- [ ] 7.4 A patent ingest of 200 completes; a card whose value proposition names the patented mechanism ranks it in the top 5
- [ ] 7.5 `npm run typecheck`, `npm test` green; `docs/next-steps.md` Phase 4 marked done with the date
