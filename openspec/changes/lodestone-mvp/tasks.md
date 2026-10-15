Work each change by its own `tasks.md`. Tick a row here only when that change
(or the named section of it) is fully ticked and its gate has passed; write
the date and the observed values in the row. Rows marked "parallel" may be
worked at the same time as the row before them.

## 0. Prerequisite

- [x] 0.1 `lodestone-corpus-compact` complete. Gate: suite green; SQL and reference ranking agree on the seeded cohort; `abstractHash` served. Date / values: 2026-10-15 — 367 passed, 1 skipped; 24 cards × (top 10 + since top 5) identical to the pre-`0014` exact scan, worst |Δscore| 2.2e-5; `abstractHash` on 968/968 dev and 15/15 production-copy documents; `0014` verified on PGlite and a Neon branch

## 1. Key

- [ ] 1.1 `lodestone-sources-repair` section 1 complete. Gate: 20-DOI keyed run, no budget notice; 25/s under a key. Date:

## 2. Measure (parallel with 3 and 4a)

- [ ] 2.1 `lodestone-eval-set` complete. Gate: `baseline.md` from `--no-search` over marks + distractors. P@5 / R@10 / MRR / fields:

## 3. Patents (parallel with 2 and 4a)

- [ ] 3.1 `lodestone-sources-repair` section 2–3 complete. Gate: 100-patent BigQuery run; bytes processed; cost; `patentsview.ts` gone. Date / values:

## 4. Publish

- [ ] 4a.1 `lodestone-publish` sections 1–2 (roster, join, health, migrate URL, seed guard) complete against PGlite. Date:
- [ ] 4b.1 `lodestone-publish` sections 3–4 complete. Gate: health all true on production and preview; owner signed in by Resend; membership-kind operator invited a second member who accepted; token minted; Whetstone connection test passes against production. Date / URL:

## 5. Search

- [ ] 5.1 `lodestone-card-search` complete. Gate: eval rows `search`, `quota`, `purpose`; marked-document MRR ≥ baseline; fields ≥ baseline + 1; one production card reaches `done` with `found > 0`; provenance allowlist holds on a searched-in paper. Date / values:
- [ ] 5.2 (parallel with 5.1) `lodestone-hit-sentences` section 1 and `lodestone-verdict-ranking` sections 1 and 3 complete against the committed corpus. Date:

## 6. Explain

- [ ] 6.1 `lodestone-hit-sentences` complete. Gate: `sentences --no-search` row equals the previous; live sentences are substrings under the hit's `abstractHash`; thin count in production noted. Date / values:

## 7. Learn

- [ ] 7.1 `lodestone-verdict-ranking` complete. Gate: `--verdicts --no-search` recorded; on production a `not_relevant` disappears for the owner and stays for another member; a pivot shows `changes` naming the edited block; `paper_block_verdict` has rows; map says prior off. Date / values:

## 8. Done

- [ ] 8.1 The seven definition-of-done checks in `design.md` hold on production, each with a date (7 waits on the first scheduled Monday)
- [ ] 8.2 `docs/next-steps.md`: Phases 2, 3, 4 and 7 marked done with dates; a new "After the MVP" section naming the verdict prior (`PRIOR_MIN_CARDS`, `PRIOR_WEIGHT`, active-member join), the threshold retune on real verdicts, patent marks for the eval set, and introductions
- [ ] 8.3 `openspec archive` each sub-change in order, then `lodestone-mvp`
