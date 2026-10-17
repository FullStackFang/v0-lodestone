## 0. Gate

- [ ] 0.1 `lodestone-card-search` merged: `card_search` exists, `PaperHit.blockKeys` exists, `searchCard` runs per send. Sections 1 and 3 below need only that; section 2 needs `card_rank` written by `searchCard`, which is in 2.x here
- [ ] 0.2 Eval baseline and the search/quota rows recorded

## 1. Verdicts in the owner's list

- [x] 1.1 Failing tests in `network.test.ts`: a `not_relevant` document is absent for the owner; a neighbour within 0.85 of a `useful` document enters with `via.useful`; `score` equals its own cosine; another member reading the same published card sees neither effect; a `peer` verdict on the same card does not break the statement
- [x] 1.2 `priorArtFor(db, ideaId, k, { since, viewerId })`; constants `NEAR_USEFUL`, `USEFUL_BOOST`; `verdicts` (guarded `::uuid`), `excluded`, `useful`, `neighbours` CTEs added only when `viewerId` is the owner; ordering key with the boost; `PaperHit.via`
- [x] 1.3 Callers: `GET` route and card page pass `person.id`; map and digest pass the owner id; the card page shows `via` only when `mine`
- [x] 1.4 Pure counterparts for `scorePaper` (`applyVerdicts(hits, verdicts, neighbours)`); the reference-vs-SQL test covers them
- [x] 1.5 `docs/api.md`: `via` on a hit; verdicts never leave the server; a non-owner never sees `via` or `changes`

## 2. Pivot diff

- [x] 2.1 Migration `0018_card_rank`: `forge_card.import_seq` int default 0; `card_rank(idea_id, import_seq, taken_at, hits jsonb, block_hashes jsonb, primary key (idea_id, import_seq))`. `paper_block_verdict` (`halfvec(1024) not null`, the unique key) shipped alone in `0017_verdict_graph` with section 3
- [x] 2.2 `importCard` bumps `import_seq` (a new card starts at 1; 0 marks a card not sent since the column existed)
- [x] 2.3 Failing tests: `searchCard` reaching `done` writes one `card_rank` row for the current `import_seq`; the first `GET` after import does not; a card not sent since `import_seq` existed gets its snapshot from `GET`; re-send with one block changed → `changes.blocks`, `added`, `dropped`; a dropped `useful` hit carries its verdict; `changes` is null while `search.state` is `running`; three reads → one snapshot
- [x] 2.4 `snapshotRank(db, ideaId, importSeq, hits, hashes)` (insert on conflict do nothing) called from `searchCard` on `done`; `changesFor(db, ideaId, hits)` keyed on block keys from `card_search`; wired into the `GET` route and the card page for the owner only
- [x] 2.5 `docs/api.md`: `changes`; null while running; what a client should say with it

Departures from `design.md` §3–4 and the `pivot-diff` spec, to match the shape Whetstone is built against (`changes: { since: string, blocks: string[], added: PaperHit[], dropped: (PaperHit & { verdict })[] } | null`):

- `since` is the card's `import_seq` as a string (the send the diff is for; the client dismisses by it), not the time of the previous snapshot.
- `card_rank.hits` keeps each hit whole, not ids, scores and first block keys, so `dropped` can be `PaperHit`s. `dropped` carries `verdict` for every hit: the owner's verdict, or `null`.
- `card_rank.block_hashes` keeps each block's text hash at snapshot time; `changes.blocks` are the keys whose `card_search.text_hash` differs from it, which also names a block that was emptied. `card_search` holds only the latest hash, so it alone cannot say what changed.
- The `GET` route snapshots a card whose `import_seq` is 0, not one with no `card_search` row: a fresh import has no row until its queued search starts, and a read in that gap would snapshot the pre-search list.
- `changes` is also null after a send whose search has not started (a block's `card_search.text_hash` differs from the card's), so a diff is never shown against the previous search's list.
- `searchCard` skips its snapshot when the card was sent again while it ran; that send's search writes its own.

## 3. Verdict graph, table and write only

- [x] 3.1 Failing tests: `recordFeedback` on a paper with `context.blockKeys` writes one `paper_block_verdict` row with the unit-mean block vector; a context with only labels maps to the key; no block or no embedded rows → no row, verdict still stored; a second verdict replaces; a `peer` verdict writes none
- [x] 3.2 `blockVector(rows, blockKey)` in `vectors.ts` with a test; implement the write in `api.ts`
- [x] 3.3 `/lodestone/map` shows operators "verdicts from N ideas; prior off"
- [x] 3.4 `docs/next-steps.md` "After the MVP": the prior as designed in `design.md` §6, with `PRIOR_MIN_CARDS` and `PRIOR_WEIGHT` named there and nowhere in code

## 4. Eval

- [ ] 4.1 `scripts/lodestone/eval.mts --verdicts --no-search`: mark top-five relevant hits of ten cards `useful` and two unmarked `not_relevant`, re-rank as owner
- [ ] 4.2 Record: excluded gone; MRR of marked documents on the ten not below the previous `--no-search` run; share of `via` hits that are marked relevant vs. share among the hits they displaced
- [ ] 4.3 `evals/lodestone/thresholds.md`: `NEAR_USEFUL`, `USEFUL_BOOST`, provisional, and the run that set them
