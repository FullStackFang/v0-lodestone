## 0. Gate

- [ ] 0.1 `lodestone-corpus-compact` merged (one canonical text, halfvec chunks). Section 1 needs only that and can run beside `lodestone-card-search`; section 2 needs the S2 path from it

## 1. Sentences

- [x] 1.1 Failing tests for `splitSentences(text)`: abbreviations protected, short fragments joined, offsets slice back to the sentence; run over the eval set's abstracts and eyeball (1,039 abstracts, 9,786 sentences, median 8; many OpenAlex abstracts drop the space after a full stop, so `cities.It` splits too)
- [x] 1.2 `src/lodestone/sentences.ts`: `splitSentences`; migration `0016_hit_sentences`: `document_sentence` with `(document_id, ordinal)` key, `text_hash`, offsets, `halfvec(1024)`, index on `document_id`; and `ALTER TYPE source_format ADD VALUE 'tldr'`; `SOURCE_FORMATS` gains `"tldr"` (offsets are `start_off`/`end_off` as on `assertions`; the primary key leads with `document_id`, so no second index)
- [x] 1.3 `ensureSentences(db, documentIds)`: split, embed in one Voyage batch, write; skip documents whose rows carry the current `text_hash`; re-cut those whose hash differs
- [x] 1.4 `sentencesFor(db, hit, blockVectors)`: top three by max cosine to the first block key's entries, abstract order, with the block key; test against a hand-built abstract and vectors
- [x] 1.5 `PaperHit.sentences` and `PaperHit.abstractHash`; `priorArtFor` callers (`GET` route, card page, digest) call `ensureSentences` then `sentencesFor` for the hits returned; `searchCard` warms the top ten on `done`
- [x] 1.6 Route test: each sentence is a substring of the abstract under the hit's `abstractHash`; a replaced abstract yields new sentences and a new hash

## 2. Thin documents

- [x] 2.1 Failing tests: `ingestWork` with `{ tldr }` on a work lacking an abstract writes `source_format = "tldr"`, `provenance.thin = true`, below thirty words; without `tldr` it still reports `no_abstract`; with `replaceThin` on a stored thin row it fetches and writes a new version; the ingest command tally gains `thin` (2026-10-17: `ingest.test.ts` "thin documents", five tests; `IngestResult.thin` is what a tally reads. The `thin` tally in `scripts/lodestone/ingest.mts` is deferred to the ingest command owner) — done 2026-10-17: the tally counts `thin` rows and prints it beside `existing`
- [x] 2.2 Implement the two options in `ingest.ts`; `searchCard` passes `tldr` from S2 and `replaceThin: true` (2026-10-17. The unique indexes on a work's ids allow one `artifact_texts` row per work, so the upgrade deletes the TLDR row and its `document_chunk` and writes the abstract under the same document — the hash changes and the next embed pass and sentence cut read the abstract. `search.test.ts` covers thin-then-upgraded with fake S2 and OpenAlex; no `S2_API_KEY` here, so the live path is unexercised)
- [x] 2.3 `THIN_FACTOR = 0.9` beside `PAPER_FLOOR`; applied in the `best` CTE ordering by joining `provenance->>'thin'`; `scorePaper` reference path orders the same way; `score` on the hit stays the cosine; test the 0.80-thin vs 0.76-full ordering on both paths (2026-10-17: the constant lives in `priorArt.ts` beside `USEFUL_BOOST`, which `digest.ts` imports from, so no cycle; the join is a `thin` CTE on the newest text's provenance, read by `ranked`; `priorArt.test.ts` "THIN_FACTOR", SQL and `scorePaper`+`applyVerdicts`)
- [x] 2.4 `PaperHit.thin`; a thin hit's `sentences` is the TLDR as one entry (2026-10-17: `withSentences` gives a thin hit its canonical text at the hit's score and cuts nothing for it; `searchCard`'s warm path skips thin hits)
- [x] 2.5 `corpusDocument`: `thin`, `abstractKind`; route test for both kinds (2026-10-17: `routes.test.ts` "serves one paper or patent")
- [x] 2.6 `digest.ts`: "summary only" after a thin title (2026-10-17: `digest.test.ts`)

## 3. Docs and eval

- [x] 3.1 `docs/api.md`: `sentences`, `thin`, `abstractHash` on a hit; `thin`, `abstractKind` on the read endpoint; what a client should do with each (2026-10-17)
- [x] 3.2 `evals/lodestone/thresholds.md`: `THIN_FACTOR` provisional, how it would be retuned (2026-10-17)
- [ ] 3.3 `npm run lodestone:eval -- --label sentences --no-search`: the four numbers equal the previous `--no-search` run (sentences do not alter ranking; the committed corpus has no thin documents) (not run 2026-10-17: needs the eval database in the other checkout and the Voyage key)
