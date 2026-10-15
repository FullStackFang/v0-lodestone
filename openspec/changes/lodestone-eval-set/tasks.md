## 0. Gate

- [ ] 0.1 `lodestone-sources-repair` section 1 merged (keyed `workUrl`, limiter by key); section 1 below can be authored before that, section 2 cannot run

## 1. The set

- [ ] 1.1 `evals/lodestone/eval-set/cards.ts`: twenty cards from the firms cohort fixtures, exported as `forge-idea/4` documents with stable idea ids
- [ ] 1.2 Choose the marked documents: for each of the twenty, two to five papers from the ingested sets (DOI or OpenAlex id) and the block each bears on; record them in `marks.ts`. Patent marks wait for `lodestone-sources-repair` §2 and go in `marks-patents.ts` then
- [ ] 1.3 Write the ten cross-field cards against papers chosen first from a field other than the card's own; mark them the same way
- [ ] 1.4 `distractors.txt`: the DOIs of the six query sets in `thresholds.md`, one per line, committed
- [ ] 1.5 Test: thirty cards, every mark names a block key, every id parses as DOI or OpenAlex id; at least ten cards have a mark whose field differs from the card's; no distractor is a mark

## 2. The runner

- [ ] 2.1 `scripts/lodestone/eval.mts`: refuse without `VOYAGE_API_KEY` or `OPENALEX_API_KEY`; open `THESIS_DATA_DIR=data/pglite-eval`; ingest marks and distractors through `ingestWork` under the keyed limiter; import every card through `importCard` with `--no-search` honoured (a no-op until card search exists); embed
- [ ] 2.2 Rank each card with `priorArtFor(db, ideaId, 10)`; compute P@5, R@10, MRR, mean distinct fields in top ten; print them
- [ ] 2.3 Write `results/<date>-<label>.md` with the per-card table (hit, score, blocks, mark status: relevant / distractor / unmarked / wrong-block)
- [ ] 2.4 `package.json`: `lodestone:eval`; README one paragraph under Tests
- [ ] 2.5 Unit test the metric functions on a hand-built ranking

## 3. The baseline

- [ ] 3.1 Run once with `--no-search` against the current ranking; commit as `baseline.md`
- [ ] 3.2 Note the four numbers in `docs/competitive-landscape.md` step 0
