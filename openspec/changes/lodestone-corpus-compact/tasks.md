## 1. Baseline

- [x] 1.1 On a copy of a database with seeded cards and an ingested corpus, record each seeded card's top 10 (ids, scores, blocks) from today's `priorArtFor` into a scratch JSON, the exact-scan baseline for 4.2 (2026-10-15: copy of the dev database, 968 papers and 24 cards at `0013`, ranked by the pre-`0014` code; each card's top 10 and a since-window top 5)
- [x] 1.2 Write failing tests: a corpus `document.text` and `document_chunk.text` are null after ingest and embed; `corpusSize` matches a count; `corpusDocument` returns `abstractHash` equal to the stored `text_hash`; `priorArtFor` gives the same ids and blocks as `scorePaper` over every row (2026-10-15: `network.test.ts` — corpus text null after embed, `corpusSize` as a count, database ranking equals `scorePaper` over every row; `routes.test.ts` — `abstractHash` equals the stored `text_hash`, 404 without a canonical text)

## 2. Store the abstract once

- [x] 2.1 `src/db/schema.ts`: `document.text` and `document_chunk.text` nullable; check constraint keeps `document.text` required for `deck`/`resume`; `document_chunk.embedding` becomes `halfvec(1024)`; index `document_chunk_embedding_hnsw` using `hnsw (embedding halfvec_cosine_ops)`
- [x] 2.2 `npx drizzle-kit generate --name corpus_compact`, then hand-add to `0014` the cast (`USING embedding::halfvec(1024)`) and the backfill nulling corpus `document.text` / `document_chunk.text` where an `artifact_texts` row exists
- [x] 2.3 `ingestWork`, `ingestPatent` and `scripts/lodestone/seed.mts` write `document.text = null`; `embedPaperAbstracts` reads the newest `canonical_text` and writes chunks with `text = null`; `corpusDocument` reads `canonical_text` only (404 without it); count and print any corpus document left without an `artifact_texts` row
- [x] 2.4 `db:migrate` on an empty Postgres (pgvector/pg17) and on PGlite; and on a copy of a populated dev database, checking that every corpus document still has a vector and the read endpoint serves the same abstract (2026-10-15: PGlite by the test suite and on the dev copy; Neon Postgres 18.6 / pgvector 0.8.6 on a throwaway branch of production — an empty database, the production copy migrated `0012`→`0014` in one run, and the dev corpus migrated from `0013`; each run twice, the second a no-op. Every corpus document kept its vector; the read endpoint served the same abstract for 15/15 production and 968/968 dev documents)

## 3. Rank and count in the database

- [x] 3.1 `priorArtFor`: candidates are the union of each block's top k by `embedding <=> $b::halfvec`, then per-block cosines for the candidates only, built into `PaperHit` by the existing best-block / 0.03-band / `yours` logic
- [x] 3.2 `since`: score only documents added after `since`, in SQL (lateral over block vectors, `max`, `order by`, `limit k`)
- [x] 3.3 `corpusSize` becomes a count; drop `papers()` if nothing else reads it
- [x] 3.4 `CorpusDocument.abstractHash`; `docs/api.md` documents it and what a client may do with it

## 4. Accept

- [x] 4.1 `npm run typecheck`, `npm test` green; existing tests that read the abstract from `document.text` move to `artifact_texts` (2026-10-15: typecheck clean; 367 passed, 1 skipped)
- [x] 4.2 Against the 1.1 baseline: every seeded card's top 10 has the same ids in the same order, scores within 0.002, and the same blocks (2026-10-15: 48 lists, no difference in ids, order, blocks or `yours`; worst score difference 2.2e-5 on PGlite and 2.1e-5 on Neon)
- [x] 4.3 Record bytes per corpus document before and after (`pg_total_relation_size` of `document`, `document_chunk`, `artifact_texts` ÷ count) in `design.md` (2026-10-15: 11,247 → 8,344 bytes per document; table in `design.md`)
- [x] 4.4 Amend the wording in `lodestone-corpus-ingest/specs/corpus-ingest/spec.md` ("the abstract as text") to name `artifact_texts`, before either change is archived
