## 1. The NeurIPS source

- [ ] 1.1 Migration `0020_neurips_id`: partial unique index on `artifact_texts (provenance->>'neurips_id')`. `db:migrate` applies it on PGlite, and the test suite stays green.
- [ ] 1.2 Add `exceljs` to `package.json`.
- [ ] 1.3 Write failing tests for `src/harness/papers/xlsx.ts` on PGlite:
  - a 2023 row stores abstract and metrics
  - a 2026 row stores no `openreview_id` and no metric keys
  - a tldr-only row stores `sourceFormat` `tldr`
  - a no-text row reports `no_text`
  - a second load reports `existing` and writes nothing
  - a duplicated id inside one file keeps the first row
- [ ] 1.4 Implement `rowOf(cells)`, which maps headers to the provenance shape and parses `openreview_id` from the URL or id, and `ingestNeuripsRow(db, row, { set })`. Add `neurips_id` to `keysOf` and `storedBySourceId`.
- [ ] 1.5 Implement `readCorpusSheet(path)` as a streaming `exceljs` reader yielding header-keyed rows from sheet `Corpus`. Test it on a three-row fixture xlsx under `src/harness/papers/__fixtures__/`.
- [ ] 1.6 `scripts/lodestone/ingest.mts`: add `--source xlsx --file <path>`, which requires `--set`, refuses to start without `VOYAGE_API_KEY`, prints one line per row, ends with `embedPaperAbstracts`, and prints a summary that includes `no_text`. Update the usage line and the header comment.

## 2. Search

- [ ] 2.1 Write failing tests for `src/harness/research/search.ts` on PGlite with a fake embedder:
  - nearest-first order
  - `--set` filters to that set and still returns `k` when the set holds `k` near rows
  - missing metrics are `null`
  - `link` prefers OpenReview, then site, then DOI
  - the embedder is called with input type `query`
- [ ] 2.2 Implement `searchPapers(db, embedder, { q, k, set })` with D5's oversample-and-widen, plus `hitOf(row)`.
- [ ] 2.3 `scripts/lodestone/search.mts`:
  - flags `--q`, `--k`, `--set`, `--openalex` and `--json <file>`
  - `--openalex` adds `searchWorks` hits with `source: "openalex"` and their W-ids, without writing them
  - text output prints `unknown` for null metrics
  - exits non-zero without `VOYAGE_API_KEY`
  - add `lodestone:search` to `package.json`
- [ ] 2.4 Test that an `--openalex` search leaves the document count unchanged, with a fake `fetch`.

## 3. Links

- [ ] 3.1 Write failing tests for `src/harness/research/links.ts` `validateLinks(links, hits, ingest)`:
  - an id not in hits moves to `unresolved` with reason `not_in_search`
  - a W-id that ingests is replaced by its document id
  - a W-id that returns `short_abstract`, `no_abstract` or `not_found` moves to `unresolved` with that status
  - every id left in `items` is a stored document id
- [ ] 3.2 Implement `validateLinks`, and `scripts/lodestone/research-links.mts <folder>`, which reads `search.json` and `links.json`, ingests through `ingestWork` with the OpenAlex limiter, rewrites `links.json`, and prints the resolved and unresolved counts. Add `lodestone:research-links` to `package.json`.

## 4. The skill

- [ ] 4.1 Write `.claude/skills/research-review/SKILL.md` with:
  - inputs: a question and a slug
  - the run-from-repo-root and stop-`next dev` rule
  - the command order: write `question.md`, search corpus and `--openalex` into `search.json`, write `review.md` and `smoke-tests.md` and `links.json`, run `research-links`, then fix or drop uncited sentences named in `unresolved`
  - the review's section shape
  - the six smoke-test fields and their limits (≤ 8 h, ≤ $20, data on hand, numeric threshold)
  - the cite-only-by-search-id rule
- [ ] 4.2 Add `research/README.md`, one paragraph on what a folder holds. Confirm `research/` is not gitignored.

## 5. Run it

- [ ] 5.1 Load the corpus against the local database:

  `npm run lodestone:ingest -- --source xlsx --file "C:\Users\Stephen.Fang\Downloads\NeurIPS_Corpus_2021-2026 (1).xlsx" --set neurips-2021-2026`

  Record the counts (new, existing, no_text, embedded) in this file. About 28,284 should be stored.
- [ ] 5.2 Check search: `npm run lodestone:search -- --q "LLM recommendations popularity bias" --set neurips-2021-2026 --k 10` returns relevant papers with ratings. Paste the top 5 titles here.
- [ ] 5.3 Run the skill on the popularity idea, using the author's original note (whetstone design doc, 2026-10-25) as the question and slug `popularity-quality`. Commit `research/popularity-quality/`.
- [ ] 5.4 Verify that every id in `links.json` resolves to a stored document, and that `review.md` cites nothing outside `search.json`. Report the unresolved count.
- [ ] 5.5 Hand the first smoke test to the author to run (the expected one is Spearman of `rating_avg` against `citations_per_year` on 2023), and record the result in `research/popularity-quality/smoke-tests.md`. This is the author's by-hand step.
