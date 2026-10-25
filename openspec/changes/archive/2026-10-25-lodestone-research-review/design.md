## Context

The approved design is `../v0-whetstone/docs/superpowers/specs/2026-10-25-research-workflow-design.md`
(Whetstone branch `research-workflow-spec`). It was reviewed twice by Fable against this repo's
code and the spreadsheet. This change is its week 1.

**Current state:**
- `lodestone:ingest` takes `--source openalex|patents` only (`scripts/lodestone/ingest.mts:56`).
- `ingestWork` writes `document` plus `artifact_texts` in one transaction
  (`src/harness/papers/ingest.ts:119`). It dedupes by provenance id before fetching
  (`storedBySourceId`) and by text hash on write (`putArtifactText`).
- `embedPaperAbstracts` (`src/lodestone/priorArt.ts:32`) embeds every paper without a vector,
  in batches.
- `embed(texts, "query")` exists (`src/harness/embed.ts:111`).
- kNN over `document_chunk.embedding` (halfvec, HNSW) is already written for card prior art
  (`priorArt.ts:386-398`).
- Scripts open `data/pglite` relative to the cwd and cannot share it with `next dev`
  (README:29, `client.ts:56-70`). `.env.local` loads from the cwd (`scripts/harness/env.mts`).

**What is in the spreadsheet** (`C:\Users\Stephen.Fang\Downloads\NeurIPS_Corpus_2021-2026 (1).xlsx`,
sheet `Corpus`, A1:Y28324):
- 28,323 rows, with 28,308 distinct `id` values.
- The 9,111 rows from 2026 have no OpenReview link, rating or citations, and their `id` is a
  6-digit neurips.cc number.
- Tldr exists only for 2021–22.
- 24 rows from 2024 have neither abstract nor tldr.
- All 3,540 rows from 2023 have both `rating_avg` and `citations_per_year`.

## Goals / Non-Goals

**Goals:**
- Load the corpus once, keyed and embedded, re-runnable.
- Search it from a shell with a question.
- A skill that writes a review with smoke tests citing only real, stored papers, and a links
  file week 2 can import unchanged.

**Non-Goals:**
- OpenAlex matching of NeurIPS rows.
- A `work_link` table.
- Assertions and the facet mapping.
- An HTTP search route.
- Whetstone changes.
- Ranking changes.

All of these are week 2 or later, per the design.

## Decisions

**D1. Read the xlsx with `exceljs` in streaming mode.** The file is 22 MB.
`exceljs.stream.xlsx.WorkbookReader` reads row by row without loading the workbook.
- *Alternative:* a one-time LibreOffice conversion to CSV. It is cheaper to code, but it adds a
  manual step and a second copy of the data that can drift. Python is not installed, so no
  pandas.
- *Alternative:* SheetJS (`xlsx`). Its npm releases are stale, and current versions ship only
  from its own CDN.

**D2. A NeurIPS row is written the way `ingestWork` writes a work.** The new
`ingestNeuripsRow(db, row, { set })` in `src/harness/papers/xlsx.ts`:
1. checks `storedBySourceId` for `neurips_id` first. `keysOf` and the provenance key list gain
   `neurips_id`.
2. writes `document` and `putArtifactText` in one transaction with `sourceFormat` `abstract`
   or `tldr`.

It returns the same `IngestResult` statuses, plus `no_text`. The 30-word floor does not apply.
These are known NeurIPS papers rather than search noise, and a tldr is short by nature. Text-hash
dedupe stays: a row whose abstract is already stored from OpenAlex reports `existing`, with
`sharedWith` set.

**D3. Uniqueness is a partial index on `provenance->>'neurips_id'`,** in migration
`0020_neurips_id`. It mirrors 0013's OpenAlex, DOI and patent indexes. `neurips_id` rather
than OpenReview id, because a third of the rows have no OpenReview id.

**D4. Absent metrics are omitted from provenance, not written as null or 0.** Search maps a
missing key to `null` in JSON and `unknown` in text, under Whetstone's "unknown is not zero" rule.

**D5. Search oversamples, then filters.** With `--set`, an HNSW scan filtered in the same
query can return fewer than `k` rows. The query therefore orders by
`embedding <=> q::halfvec(dims)` with `limit k * 20` in a CTE, joins `artifact_texts`, filters
on `query_set`, and takes `k`. If fewer than `k` survive, it widens once to `k * 100`.
- *Alternative:* pgvector's iterative scan. It is not confirmed on the PGlite build, so it is
  not relied on.

**D6. The search logic is a pure module plus a thin script.** `src/harness/research/search.ts`
exports `searchPapers(db, embedder, { q, k, set })` and `hitOf(row)`, tested on PGlite with a
fake embedder. `scripts/lodestone/search.mts` parses flags, adds `searchWorks` hits for
`--openalex`, and prints or writes JSON.

**D7. The validator is deterministic code, not part of the prompt.**
`src/harness/research/links.ts` exports `validateLinks(links, hits, ingest)`, which is pure
given an injected ingest. `scripts/lodestone/research-links.mts` wires it to `ingestWork`
through the `--list` path and rewrites `links.json` in place. The model is told to cite only
search ids, and the validator enforces it.

**D8. The skill is a Claude Code skill, run by the session itself, not by `claude -p`.** The
author runs it from a Claude Code session in this repo. The session does the reasoning, and
the scripts do everything that touches data. `SKILL.md` holds:
- the review shape
- the smoke-test fields and limits
- the cite-only-by-id rule
- the order of commands
- the rule that commands run from the repo root with `next dev` stopped

**D9. `research/` is committed at the repo root.** The reviews are the author's work. `data/`
is gitignored and excluded from OneDrive (README:94).

## Risks / Trade-offs

- **The model cites an id it was not given.** → The validator moves it to `unresolved`. The
  skill re-reads `unresolved` and either removes the sentence or marks it uncited.
- **Same abstract text, two documents.** An OpenAlex-ingested paper and its NeurIPS row can
  collide. → Text-hash dedupe answers the existing artifact, and the NeurIPS provenance is not
  merged into it. This is accepted: the search still finds the paper, but its metrics come
  from whichever row landed first.
- **The load runs 15–30 minutes and may hit the Voyage rate limit.** → Rows are written before
  embedding, `embedPaperAbstracts` writes per batch, and a re-run finishes the rest.
- **`next dev` is holding `data/pglite`.** → The scripts fail fast with the existing client
  error, and `SKILL.md` says to stop the server first. `DATABASE_URL` is honoured for a
  Postgres target.
- **Filtered kNN misses hits from the set.** → D5's widening. The scenario test asserts that `k`
  hits return for a set that holds at least `k` near rows.

## Migration Plan

`npm run db:migrate` applies `0020_neurips_id` to PGlite and Postgres. Rollback is dropping the
index; no existing rows change. The load is additive. Removing it means deleting documents
whose `provenance->>'query_set' = 'neurips-2021-2026'`, along with their chunks and sentences.

## Open Questions

None blocking. Whether NeurIPS rows should later be matched to OpenAlex, which would give DOIs
and `referenced_works`, belongs to `lodestone-useful-together`.
