## 1. The NeurIPS source

- [x] 1.1 Migration `0020_neurips_id`: partial unique index on `artifact_texts (provenance->>'neurips_id')`. `db:migrate` applies it on PGlite, and the test suite stays green.
  - Generated from `schema.ts` with `drizzle-kit generate --name neurips_id`. `db:migrate` is Postgres-only; PGlite applies it on open, which the xlsx tests and a scratch-directory run exercise. The full suite after this change ran 62 files, 551 tests passed and 1 skipped.
- [x] 1.2 Add `exceljs` to `package.json`.
- [x] 1.3 Write failing tests for `src/harness/papers/xlsx.ts` on PGlite:
  - a 2023 row stores abstract and metrics
  - a 2026 row stores no `openreview_id` and no metric keys
  - a tldr-only row stores `sourceFormat` `tldr`
  - a no-text row reports `no_text`
  - a second load reports `existing` and writes nothing
  - a duplicated id inside one file keeps the first row
- [x] 1.4 Implement `rowOf(cells)`, which maps headers to the provenance shape and parses `openreview_id` from the URL or id, and `ingestNeuripsRow(db, row, { set })`. Add `neurips_id` to `keysOf` and `storedBySourceId`.
  - `neurips_id` went into `SourceKeys` and `storedBySourceId` only. `keysOf` parses a bare identifier into a DOI or W-id, and a NeurIPS id cannot be recognised from its shape, so nothing calls it with one.
  - Found in the sheet, not in the design: 2025 rows mark missing citations `-1`, with `citation_percentile_in_year` `0`. `rowOf` drops all three citation metrics when `citations` is negative, so they read `unknown`, not `-1` or `0`.
  - Every column except `abstract` rides in provenance; `authors` is split on `;` into the array `citationLine` expects. A tldr-only row is marked `thin`, as card search's TLDR rows are.
- [x] 1.5 Implement `readCorpusSheet(path)` as a streaming `exceljs` reader yielding header-keyed rows from sheet `Corpus`. Test it on a three-row fixture xlsx under `src/harness/papers/__fixtures__/`.
  - exceljs's own writer puts `xl/workbook.xml` last in the zip, and its streaming reader cannot read that order. The fixture was repacked in Excel's order, with workbook first.
- [x] 1.6 `scripts/lodestone/ingest.mts`: add `--source xlsx --file <path>`, which requires `--set`, refuses to start without `VOYAGE_API_KEY`, prints one line per row, ends with `embedPaperAbstracts`, and prints a summary that includes `no_text`. Update the usage line and the header comment.

## 2. Search

- [x] 2.1 Write failing tests for `src/harness/research/search.ts` on PGlite with a fake embedder:
  - nearest-first order
  - `--set` filters to that set and still returns `k` when the set holds `k` near rows
  - missing metrics are `null`
  - `link` prefers OpenReview, then site, then DOI
  - the embedder is called with input type `query`
- [x] 2.2 Implement `searchPapers(db, embedder, { q, k, set })` with D5's oversample-and-widen, plus `hitOf(row)`.
  - An HNSW index scan returns at most `hnsw.ef_search` rows (default 40) whatever the `limit`, so each pass sets it locally to the reach, capped at pgvector's 1000. Without that, `k * 20` would quietly be 40. Card prior art's `limit reach` has the same cap and is not touched here.
  - Removing the widen fails the set test, so the test guards it.
- [x] 2.3 `scripts/lodestone/search.mts`:
  - flags `--q`, `--k`, `--set`, `--openalex` and `--json <file>`
  - `--openalex` adds `searchWorks` hits with `source: "openalex"` and their W-ids, without writing them
  - text output prints `unknown` for null metrics
  - exits non-zero without `VOYAGE_API_KEY`
  - add `lodestone:search` to `package.json`
  - OpenAlex hits come from semantic search with the scholarly filter, as card search asks: a question reads better semantically than as keywords.
- [x] 2.4 Test that an `--openalex` search leaves the document count unchanged, with a fake `fetch`.
  - The live hits are `openalexHits` in the module, so the test runs on PGlite rather than through the script.

## 3. Links

- [x] 3.1 Write failing tests for `src/harness/research/links.ts` `validateLinks(links, hits, ingest)`:
  - an id not in hits moves to `unresolved` with reason `not_in_search`
  - a W-id that ingests is replaced by its document id
  - a W-id that returns `short_abstract`, `no_abstract` or `not_found` moves to `unresolved` with that status
  - every id left in `items` is a stored document id
- [x] 3.2 Implement `validateLinks`, and `scripts/lodestone/research-links.mts <folder>`, which reads `search.json` and `links.json`, ingests through `ingestWork` with the OpenAlex limiter, rewrites `links.json`, and prints the resolved and unresolved counts. Add `lodestone:research-links` to `package.json`.
  - A resolved OpenAlex link keeps the W-id it came `from`, so a second run over its own output changes nothing. Without that, the second run would call the new document id `not_in_search`.
  - The script parses `links.json` with zod and refuses a wrong kind or relation by name. It ingests with `query_set` `research/<slug>` and the thirty-word floor, and ends by embedding what it stored.

## 4. The skill

- [x] 4.1 Write `.claude/skills/research-review/SKILL.md` with:
  - inputs: a question and a slug
  - the run-from-repo-root and stop-`next dev` rule
  - the command order: write `question.md`, search corpus and `--openalex` into `search.json`, write `review.md` and `smoke-tests.md` and `links.json`, run `research-links`, then fix or drop uncited sentences named in `unresolved`
  - the review's section shape
  - the six smoke-test fields and their limits (≤ 8 h, ≤ $20, data on hand, numeric threshold)
  - the cite-only-by-search-id rule
- [x] 4.2 Add `research/README.md`, one paragraph on what a folder holds. Confirm `research/` is not gitignored.
  - `git check-ignore` matches neither `research/` nor `.claude/skills/research-review/`.

## 5. Run it

- [x] 5.1 Load the corpus against the local database:

  `npm run lodestone:ingest -- --source xlsx --file "C:\Users\Stephen.Fang\Downloads\NeurIPS_Corpus_2021-2026 (1).xlsx" --set neurips-2021-2026`

  Record the counts (new, existing, no_text, embedded) in this file. About 28,284 should be stored.

  - Ran 2026-10-25 into `v0-lodestone/data/pglite` (the master worktree's database), with `THESIS_DATA_DIR` set from this worktree.
  - Result: **28,284 new, 15 existing (duplicate ids in the sheet), 24 no_text, 28,284 embedded, 0 without a vector.** Exit 0.
  - It took about 43 minutes: 5 to read and write the rows, then 38 to embed. The embed pass is CPU-bound on PGlite's HNSW inserts, not on Voyage.
  - No row came out tldr-only; every 2021–22 row with a tldr also has an abstract.
- [x] 5.2 Check search: `npm run lodestone:search -- --q "LLM recommendations popularity bias" --set neurips-2021-2026 --k 10` returns relevant papers with ratings. Paste the top 5 titles here.
  - 10 hits, all from the set, in 9 s. 2025 hits read `citations/yr unknown`, where the sheet's `-1` would otherwise have shown. The top 5:
    1. Echoes in Filter Bubble: Diagnosing and Curing Popularity Bias in Generative Recommender Systems (2026), 0.646
    2. AgentTailor: Dual-Gate LLM-Assisted Re-ranking for Personalized Long-Tail Recommendation (2026), 0.642
    3. How Does Topology Bias Distort Message Passing in Graph Recommender? A Dirichlet Energy Perspective (2025, rating 4.33), 0.636
    4. Incorporating Bias-aware Margins into Contrastive Loss for Collaborative Filtering (2022, rating 5.67, 15.8 citations/yr), 0.635
    5. Is Your LLM-as-a-Recommender Agent Trustable? LLMs' Recommendation is Easily Hacked by Biases (Preferences) (2026), 0.624
- [x] 5.3 Run the skill on the popularity idea, using the author's original note (whetstone design doc, 2026-10-25) as the question and slug `popularity-quality`. Commit `research/popularity-quality/`.
  - The original note was never saved; only the hand-made review of it was, pasted into the design session. `question.md` is rebuilt from the claims that review quotes back to the author, and says so. The hand-made review is kept verbatim as `manual-review.md`, the baseline.
  - **Design gap found:** one query per question drifts. The long question pulled in DPO and preference-alignment papers on the word "preferences", and missed the GEO and monoculture work.
    - `--q` now repeats, one per sub-claim, and `mergeHits` keeps each paper once at its best similarity (tested).
    - The skill says to split the question into two to four sub-claims.
  - The final search used four queries and returned 58 stored and 60 live hits.
  - Compared with the hand-made review, the search surfaced papers it missed. Information Discernment (models "rely on source popularity twice as much as source reliability") partly closes its "agents defer?" gap. Frequency-phase pretraining evidence supports the frequency prior.
- [x] 5.4 Verify that every id in `links.json` resolves to a stored document, and that `review.md` cites nothing outside `search.json`. Report the unresolved count.
  - `review.md` cites 21 distinct ids, all in `search.json`; its Sources section is generated from that file.
  - `links.json` holds 27 links over 21 distinct ids, and all 21 are stored documents, checked against the database. Two OpenAlex works were ingested and embedded by `research-links`.
  - **Unresolved: 0.** A second `research-links` run changes nothing.
  - All 27 quotes are verbatim substrings of their hit's abstract. The validator does not check this; it was checked by hand once.
- [x] 5.5 Hand the first smoke test to the author to run (the expected one is Spearman of `rating_avg` against `citations_per_year` on 2023), and record the result in `research/popularity-quality/smoke-tests.md`. This is the author's by-hand step.
  - The author said to continue, so it was run in-session, from the sheet through `readCorpusSheet` and `rowOf`.
  - Result: **ρ = 0.106 on 3,526 rows, which passes** (the kill line is 0.6).
  - 14 of the 2023 rows have the no-citation sentinel, so "all 3,540 have both" in the design was slightly off.
