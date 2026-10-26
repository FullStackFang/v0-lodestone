## Why

Week 1 (`lodestone-research-review`) works only on the author's laptop. The 28,284 NeurIPS
papers are in local PGlite, and search runs only as `lodestone:search` from a shell in this
repo. The author works in Whetstone against the published Lodestone at
`v0-lodestone.vercel.app`, so from where they work none of week 1 exists.

Lodestone is also meant to be a service other clients can call. Search should therefore be
an endpoint on the API Whetstone already uses, with the same tokens, not a private path for
Whetstone.

## What Changes

- **The NeurIPS corpus in production.**
  - Apply migration `0020_neurips_id` to production Neon with `npm run db:migrate`.
  - Load the sheet with the existing `lodestone:ingest --source xlsx` against the
    production `DATABASE_URL`.
  - This is a one-time release step, not new code. The ingest is idempotent by
    `neurips_id`, and the set is removable by `query_set = 'neurips-2021-2026'`.
- **`POST /api/lodestone/papers/search`**:
  - The body carries 1–4 questions, `k`, an optional `set`, and an optional `openalex`.
  - It answers with hits in the `PaperSearchHit` shape that `lodestone:search --json`
    already writes. Several questions are merged with `mergeHits`.
  - It is behind `withToken`, with the same `lst_` bearer tokens and the same JSON error
    shape as every other client route.
  - Without `VOYAGE_API_KEY` the route answers 503, never an empty list.
- **The search is the same code everywhere.** The route and the CLI both call
  `searchPapers` and `openalexHits`, so a hit means the same thing from either.

## Capabilities

### New Capabilities
- `paper-search-api`: the authenticated HTTP search over the stored corpus, plus optional
  live OpenAlex hits.

### Modified Capabilities
(none: `research-search` keeps its CLI requirements unchanged; the route reuses its
functions)

## Non-goals

- **Rate limits, usage metering, an MCP server.** These come when there is a second token
  holder. Today the only tokens are the author's and the pilot members'.
- **Ingesting cited OpenAlex works over HTTP** (`research-links` as a route). That is
  Whetstone week 2's `work_link`, a separate change.
- **Whetstone changes.** Whetstone calls this route in its own week-2 change.
- **Serving to the public.** See design: abstracts from the NeurIPS sheet have not been
  cleared for redistribution, which gates any public key, not this change.

## Impact

- New `src/app/api/lodestone/papers/search/route.ts`, and tests in `routes.test.ts`.
- Production Neon gains about 28k `document` rows, one `artifact_texts` row each and one
  halfvec chunk each, plus the HNSW entries. That is an estimated 200–300 MB, which must
  fit the Neon plan; this is checked before loading.
- No schema change beyond `0020`, which is already merged.
