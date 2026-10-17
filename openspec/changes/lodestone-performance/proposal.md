## Why

A read-only performance review on 2026-10-17 (tree `7300163`, dev mode, warm,
PGlite, seven published cards) measured `/lodestone` at 770–950 ms and
`/lodestone/map` at 625–850 ms for one owned card, against a request floor of
190–330 ms on `/lodestone/tokens`, which runs one small query. The browser side
is fine: 193 KB gzipped of JS, almost all framework; `next/font`; no layout
shift. Every millisecond above the floor is server work, and it is structural:

- The layout resolves the session, then every page resolves it again. Each
  pass is a better-auth session read, an `ensurePerson` select, an
  `INSERT … ON CONFLICT DO NOTHING`, and a select-join. Membership is then
  read up to three more times. Nine queries and two insert attempts precede
  any page work, on every route including `/` and `/login`.
- `/lodestone` loads every cohort card (full `doc` jsonb) three times, then
  once more per owned card, and reloads every cohort card's 1024-d vectors per
  owned card, in a serial loop. The digest, which the page shows six rows of,
  is computed whole on every render and does a full `document` scan per card.
- `/lodestone/map` runs four queries per published card, serially.
- `src/lodestone/cards.ts` imports `@/harness/founder/forge`, which reaches
  `@/harness/model` and so `@anthropic-ai/sdk` and the Claude CLI shim. Every
  page and API route evaluates them at cold start although no Lodestone
  request calls a model. The shim's `existsSync` over `PATH` makes Turbopack
  trace the whole project into every server function (`npm run build` warns),
  and the PGlite WASM is traced into production functions that only ever use
  postgres-js.
- No `Suspense`, `loading.tsx` or `error.tsx` exists, so each page's TTFB is
  its slowest query.

## What Changes

- **One session resolution per request.** `src/lib/session.ts` memoises the
  resolver with React `cache()`; a `currentMembership()` beside it does the
  same for the membership row. The layout and every page read those. The
  identity bridge selects before it inserts.
- **One cohort fetch per render, and no per-card query loops.** The page
  fetches `cohortCards` once and passes it down; `digestFor` and `peersFor`
  accept the cohort, the owner's cards and the vectors they already hold;
  `cohortCounts` counts instead of materialising; `priorArtFor` gains a
  many-cards form that ranks every card in one statement, used by the digest
  and the map; `document` gets the `(source, created_at)` index the digest's
  `since` scan needs; the remaining per-card loops run under `Promise.all`.
- **The model leaves the Lodestone import graph.** The three symbols
  `forge.ts` needs from model-importing modules (`TURN_SEPARATOR`,
  `claimExtractionRun`, `ladder`) move to leaf modules or a lazy import, so
  no Lodestone route loads `@anthropic-ai/sdk` or `src/engine/cli-model.ts`.
  `next.config.ts` excludes PGlite and `data/` from production traces.
- **Streaming on the two slow pages, if the numbers still call for it.**
  `/lodestone` sends the chrome, hero and the cards grid first; the digest
  nameplate, insights, cohort rows and §03 arrive under `Suspense` from one
  shared promise. The card page sends the nine blocks first and streams
  prior art and peers. No route-level `loading.tsx`: it would turn the
  signed-out redirect into a streamed 200. This group runs only if
  `/lodestone` is still above 400 ms warm after the first three groups.
- **Small guards.** A timeout on the Voyage fetch; embedding writes in one
  statement; `maxDuration` on the digest cron; `/` redirected in config, not
  in a render; optionally `last_used_at` stamped at most once per five
  minutes.

## Capabilities

### Modified Capabilities
- `performance`: request-path cost bounded per route; the model SDK absent
  from the network's import graph; slow panels streamed.

## Non-goals

- **No cross-request caching of cohort-derived data.** `unstable_cache` on
  the digest or the map would hold a revoked member's cards until a
  revalidation, which breaks the carried rule that a revoked member's cards
  fall out of every list without a write. Batching alone brings both pages
  near the floor; caching is reconsidered only if a measured page is still
  slow after this change, and then with revocation invalidating the tag.
- No `cacheComponents`, no `use cache`, and the `dynamic = "force-dynamic"`
  exports stay. Enabling Cache Components removes those exports and is its
  own change.
- No better-auth `cookieCache`. After this change the session is one query
  per request; trading revocation lag for that query is a separate decision.
- No change to ranking, scores, thresholds or what any page shows. Every
  acceptance check below compares output before and after.
