## 0. Gate

- [ ] 0.1 Post-MVP: `lodestone-mvp` 8.1 holds on production; no row of this change is in `lodestone-mvp/tasks.md`
- [ ] 0.2 `lodestone-verdict-ranking` merged: `via.useful`, `applyVerdicts`, owner-only verdict CTEs, `--verdicts` eval row recorded
- [ ] 0.3 The user has answered the open questions in `design.md` (members vs cards; cohort gate; `known` verdicts)

## 1. References

- [ ] 1.1 Confirm against a live call: `/works?filter=openalex_id:W…|…` with 100 ids and `select=id,referenced_works` returns 100 works; keyword and semantic search pages carry `referenced_works`
- [ ] 1.2 Migration (the next number): `document_references(document_id uuid pk references document on delete cascade, work bigint not null, cited bigint[] not null, fetched_at timestamptz not null)`
- [ ] 1.3 Failing tests: `ingestWork` with a work carrying `referenced_works` writes one row with W numbers as bigints; an empty list writes `'{}'`; a held paper writes nothing; a patent writes nothing; `GET /papers/<id>` provenance still within `PROVENANCE_KEYS`
- [ ] 1.4 `OpenAlexWork.referenced_works`; `wNumber(id)` parser; the write inside `ingestWork`'s transaction
- [ ] 1.5 `scripts/lodestone/references.mts`: batches of 100 under `openalexLimiter`, resumable, lists ids not returned, prints notices; fake-`fetch` test for the URL and the batching
- [ ] 1.6 Run the backfill on the dev and eval corpora, then production; record requests, rows and table size

## 2. Known link

- [ ] 2.1 Failing tests on hand-built rows: direct citation either way → known; Jaccard ≥ `KNOWN_COUPLING` → known; disjoint lists → not known; a missing row or two empty lists → unknown
- [ ] 2.2 `knownLink(a, b)` pure in `priorArt.ts` and its SQL form; constant `KNOWN_COUPLING`

## 3. Useful together

- [ ] 3.1 Failing tests in `network.test.ts`: below `PRIOR_MIN_CARDS` the ranking is identical with co-marks present; above it, a B co-marked by three other active members with the owner's useful A and not known to A enters with `via: { useful: A, together: 3 }` and `score` its own cosine; two members → nothing; a revoked member does not count; the viewer's own co-marks do not count; B known to A → no boost, no `together`; a hit both near and together carries `together` and one boost; another member reading the card sees no `via`; a peer verdict does not break the cast
- [ ] 3.2 `TOGETHER_MIN`, `TOGETHER_BOOST`, `PRIOR_MIN_CARDS` (or its import); `together`, `surprise` CTEs and the gate subquery added only for the owner; candidates union; ordering by `greatest` of the boosts; `PaperHit.via.together`
- [ ] 3.3 `applyTogether(hits, surprise)` beside `applyVerdicts`; the reference-vs-SQL test covers it
- [ ] 3.4 `docs/api.md`: `via.together`, its meaning, never below `TOGETHER_MIN`, what a client should say; old clients reading `via.useful` unaffected
- [ ] 3.5 `/lodestone/map` operator line: cards with verdicts vs `PRIOR_MIN_CARDS`, qualifying pairs, "together on/off"

## 4. Eval

- [ ] 4.1 `scripts/lodestone/eval.mts --known`: share of `known` false and the Jaccard distribution for same-card mark pairs, random pairs and top-ten pairs; same-block variant as a second row
- [ ] 4.2 `--together --no-search`: synthetic three-member agreement on mark pairs; record hidden-mark entry rate with `via.together`, known-strong pairs unboosted, gate-closed identical, displacement under random fake pairs
- [ ] 4.3 `evals/lodestone/thresholds.md`: `KNOWN_COUPLING`, `TOGETHER_MIN`, `TOGETHER_BOOST`, provisional, and the runs that set them
- [ ] 4.4 Production read after the gate opens and 50 owner reads carry `via.together`: share later marked `useful` vs the displaced hits; share of qualifying pairs with `known` false. Accept at "at least as often"; else `TOGETHER_BOOST` = 0 and record why
