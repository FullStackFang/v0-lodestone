## Why

Prior art on Lodestone is only as good as the corpus, and the corpus is the
fifteen hand-written abstracts the seed script files. Every match Whetstone
shows beside the canvas, every "papers touched" count on the map and every
digest row is ranked against those fifteen. The Phase 4 note in
`docs/next-steps.md` says what is needed — hundreds to thousands of real
abstracts — and the ingest that would get them was trimmed out on Oct 1 with
the harness. Its two modules (`papers/openalex.ts`, `papers/ingest.ts`) still
exist, tested, in `../v0-whetstone/whetstone/src/harness/papers/`.

Patents were never in scope anywhere. For a campus network they are the other
half of "the university's own research": a disclosure or a granted patent is
what a tech-transfer office actually has to hand a student. They are the
same shape as a paper for everything Lodestone does — a title, an abstract,
provenance, one vector — and the schema's `document.source` enum is one value
short of holding them.

Whetstone's side of the bridge (Phase 7.3) shows a hit as a title and a score.
To do anything with it — read it, weigh it against a block with the author's
own model — it needs the abstract, and the API returns none. One read
endpoint closes that.

## What Changes

- **Restore the per-work ingest.** `src/harness/papers/openalex.ts` and
  `ingest.ts` come back from the Whetstone copy unchanged: fetch one work,
  rebuild the inverted-index abstract, write `document` + `artifact_texts`,
  idempotent on the canonical text.
- **Add a query ingest.** `searchWorks` pages OpenAlex `/works` by search
  string, `from_publication_date` and `has_abstract:true`, cursor-paginated,
  polite pool, stopping cleanly on 429 with the cursor printed so the run can
  resume. Each work goes through `ingestWork`.
- **Add patents as a second source.** `document.source` gains `patent`. A
  `patentsview.ts` module reads granted US patents from the PatentsView
  search API (title, abstract, grant date, assignees, inventors, CPC) by
  query and date, through the same `putArtifactText` path with `sourceFormat
  = "abstract"` and a patent provenance (`patent_number`, `url`,
  `assignees`, `cpc`, `year`, `field` from the CPC section label).
- **One command.** `npm run lodestone:ingest -- --source openalex|patents
  --query "<text>" [--since 2018] [--limit 500] [--set <name>]`. `--set`
  names the query set and rides in provenance so a hit can say where it came
  from. The command ends by embedding every document without a vector, so a
  run killed mid-embed is finished by the next one.
- **Dedupe before fetch.** A unique key on `(source, provenance id)` — DOI or
  OpenAlex id for a paper, patent number for a patent — is checked before
  any row is written. Text-hash dedupe stays as the second line.
- **Patents rank beside papers.** `priorArtFor` and the digest read both
  sources; `PaperHit` gains `kind: "paper" | "patent"` and `querySet`.
  `docs/api.md` documents both fields.
- **A read endpoint.** `GET /api/lodestone/papers/<documentId>` returns the
  title, the canonical abstract, `kind`, provenance and a citation line, to
  any valid token. Abstracts and metadata from OpenAlex are CC0 and
  PatentsView data is public domain; full text is never stored, so there is
  nothing to withhold.
- **The corpus on the map.** `/lodestone/map` shows the count per source,
  the query sets, and the date of the last ingest.
- **The retune, written down.** `evals/lodestone/thresholds.md` records a
  sample of twenty cards × top five hits with a human relevance mark and
  the `card_feedback` counts, and the `CLOSE` / `PAPER_FLOOR` values chosen
  from it.

## Capabilities

### New Capabilities
- `corpus-ingest`: the query ingest for papers and patents, the dedupe key,
  resumable embedding, and the corpus surface on the map.
- `paper-read`: the read endpoint and the `kind` / `querySet` fields on a hit.

### Modified Capabilities
- None recorded; Lodestone has no `openspec/specs/` yet. This change starts
  the directory.

## Non-goals

- No model call on the server, in ingest or in ranking (rule 1 of
  `docs/next-steps.md` §0). Matching stays cosine against one abstract vector.
- No full text. The read endpoint serves the abstract Lodestone already holds.
- No Google Patents, Lens or Semantic Scholar. PatentsView is keyed but free
  and returns abstracts; the others are either unkeyed-but-scraped or paid.
- No campus-specific corpus (Cornell OSP disclosures). That is a pilot
  operation on top of this command, with a `--list` file, not a source.
- No atlas (Phase 7.4). It reads the same vectors and is its own change.

## Impact

- New: `src/harness/papers/openalex.ts`, `ingest.ts`, `search.ts`,
  `patentsview.ts`, `scripts/lodestone/ingest.mts`, `src/app/api/lodestone/
  papers/[documentId]/route.ts`, `evals/lodestone/thresholds.md`.
- Changed: `src/db/schema.ts` (enum value, unique index), one migration
  `0013_corpus_sources`, `src/lodestone/priorArt.ts` (both sources, `kind`,
  `querySet`), `src/lodestone/digest.ts`, `src/app/lodestone/map/page.tsx`,
  `docs/api.md`, `package.json`, `.env.example` (`OPENALEX_MAILTO`,
  `PATENTSVIEW_API_KEY`).
- Whetstone: `PriorArtHit` gains `kind` and `querySet`; the panel shows a
  "Patent" eyebrow. The read endpoint is what `forge-paper-support` in
  `../v0-whetstone` consumes.
- No new dependencies. `fetch` is global; PGlite and Postgres both take the
  enum change through drizzle.
