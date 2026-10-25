## Why

The author runs research ideas by hand. They ask an LLM to think the idea through, compare it
against a 28k-paper NeurIPS scrape, and get back a review: what holds up, what is taken, the
gap, candidate studies. Each review lives in a separate Claude project, cites papers nobody
checked, and connects to nothing, so the next idea starts from zero.

Lodestone already has what this routine needs, but has never been pointed at it:
- a paper store
- Voyage embeddings with an HNSW index
- OpenAlex ingest

This is week 1 of `../v0-whetstone/docs/superpowers/specs/2026-10-25-research-workflow-design.md`
(branch `research-workflow-spec` there). It makes the routine usable on one real idea this week,
with real papers, and leaves nothing to throw away when week 2 moves it into the apps.

## What Changes

- **The NeurIPS corpus as a source.** `lodestone:ingest --source xlsx --file <path> --set <name>`
  reads the `Corpus` sheet of the author's spreadsheet (28,323 rows, 2021–2026):
  - Each row becomes a paper document whose canonical text is its abstract, falling back to its
    tldr.
  - Every column is kept in provenance.
  - Rows are keyed on `neurips_id` (the sheet's `id` column). They are not matched to OpenAlex.
  - The run ends embedding through the existing `embedPaperAbstracts`.
  - A migration adds a unique partial index on `provenance->>'neurips_id'`.
- **A search command.** `lodestone:search --q "<text>"` returns the nearest stored papers to a
  question.
  - It embeds the query in Voyage's query role and runs kNN over `document_chunk`.
  - Optional flags: a query-set filter, live OpenAlex hits (`--openalex`), and JSON output.
  - Empty metrics print `unknown`, never 0.
  - It refuses to run without `VOYAGE_API_KEY`.
- **A `research-review` skill.** It lives in `.claude/skills/research-review/` and turns a
  question into a folder `research/<slug>/` holding:
  - the question
  - the search hits
  - a review in a fixed shape that may cite only the search hits
  - three six-field smoke tests
  - `links.json`, which maps each claim, gap and smoke test to stored paper ids

  A validator moves any id outside the hits, and any cited OpenAlex work that did not store, to
  `unresolved`.
- **`research/` is committed.** Research output is the author's work and must be backed up.
  `data/` is gitignored and excluded from OneDrive sync.

## Capabilities

### New Capabilities

- `corpus-xlsx`: loading a NeurIPS-style spreadsheet as a keyed, embedded paper source.
- `research-search`: the search command, covering query embedding, kNN, filters, OpenAlex hits
  and output.
- `research-review`: the skill's output folder, the review shape, the smoke-test shape, and
  link validation.

### Modified Capabilities

None. `corpus-ingest` belongs to an unarchived change, and `--source xlsx` adds a branch
without changing its requirements.

## Impact

- **New code:**
  - `src/harness/papers/xlsx.ts`
  - `src/harness/research/{search,links}.ts`
  - `scripts/lodestone/search.mts`
  - `.claude/skills/research-review/SKILL.md`
  - migration `0020_neurips_id`
- **Modified code:** `scripts/lodestone/ingest.mts` (new source) and `package.json`
  (`lodestone:search`, an xlsx reader dependency).
- **Data:** about 28k rows in `document` and `artifact_texts`, and about 28k vectors. Voyage
  cost is about $0.40.
- **Not touched:**
  - the card import
  - ranking
  - the API routes
  - Whetstone

  `work_link`, the facet mapping and the search route are week 2.
