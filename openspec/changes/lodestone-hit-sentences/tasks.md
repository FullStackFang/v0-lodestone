## 0. Gate

- [ ] 0.1 `lodestone-corpus-compact` merged (one canonical text, halfvec chunks). Section 1 needs only that and can run beside `lodestone-card-search`; section 2 needs the S2 path from it

## 1. Sentences

- [ ] 1.1 Failing tests for `splitSentences(text)`: abbreviations protected, short fragments joined, offsets slice back to the sentence; run over the eval set's abstracts and eyeball
- [ ] 1.2 `src/lodestone/sentences.ts`: `splitSentences`; migration `0016_hit_sentences`: `document_sentence` with `(document_id, ordinal)` key, `text_hash`, offsets, `halfvec(1024)`, index on `document_id`; and `ALTER TYPE source_format ADD VALUE 'tldr'`; `SOURCE_FORMATS` gains `"tldr"`
- [ ] 1.3 `ensureSentences(db, documentIds)`: split, embed in one Voyage batch, write; skip documents whose rows carry the current `text_hash`; re-cut those whose hash differs
- [ ] 1.4 `sentencesFor(db, hit, blockVectors)`: top three by max cosine to the first block key's entries, abstract order, with the block key; test against a hand-built abstract and vectors
- [ ] 1.5 `PaperHit.sentences` and `PaperHit.abstractHash`; `priorArtFor` callers (`GET` route, card page, digest) call `ensureSentences` then `sentencesFor` for the hits returned; `searchCard` warms the top ten on `done`
- [ ] 1.6 Route test: each sentence is a substring of the abstract under the hit's `abstractHash`; a replaced abstract yields new sentences and a new hash

## 2. Thin documents

- [ ] 2.1 Failing tests: `ingestWork` with `{ tldr }` on a work lacking an abstract writes `source_format = "tldr"`, `provenance.thin = true`, below thirty words; without `tldr` it still reports `no_abstract`; with `replaceThin` on a stored thin row it fetches and writes a new version; the ingest command tally gains `thin`
- [ ] 2.2 Implement the two options in `ingest.ts`; `searchCard` passes `tldr` from S2 and `replaceThin: true`
- [ ] 2.3 `THIN_FACTOR = 0.9` beside `PAPER_FLOOR`; applied in the `best` CTE ordering by joining `provenance->>'thin'`; `scorePaper` reference path orders the same way; `score` on the hit stays the cosine; test the 0.80-thin vs 0.76-full ordering on both paths
- [ ] 2.4 `PaperHit.thin`; a thin hit's `sentences` is the TLDR as one entry
- [ ] 2.5 `corpusDocument`: `thin`, `abstractKind`; route test for both kinds
- [ ] 2.6 `digest.ts`: "summary only" after a thin title

## 3. Docs and eval

- [ ] 3.1 `docs/api.md`: `sentences`, `thin`, `abstractHash` on a hit; `thin`, `abstractKind` on the read endpoint; what a client should do with each
- [ ] 3.2 `evals/lodestone/thresholds.md`: `THIN_FACTOR` provisional, how it would be retuned
- [ ] 3.3 `npm run lodestone:eval -- --label sentences --no-search`: the four numbers equal the previous `--no-search` run (sentences do not alter ranking; the committed corpus has no thin documents)
