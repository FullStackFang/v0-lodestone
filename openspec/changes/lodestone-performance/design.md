## Context

Next 16.3.4, App Router, no `cacheComponents`. Every route is dynamic because
`src/app/layout.tsx` reads `headers()` before it opens the database. The
database is one handle per process (`src/db/client.ts`, via `globalThis`),
PGlite in dev and test, postgres-js in production. Auth is better-auth with
`cookieCache` off, so a session read is a query. Vector search already runs
in SQL against an HNSW index on `document_chunk` (`drizzle/0014`); the
per-card peer scoring runs in memory over `ideaVectors`.

Measured query shape today, `/lodestone` with N owned cards and M cohort cards:

| Step | Queries | Loads |
| --- | --- | --- |
| layout session + membership | ~5 | |
| page session + `isActiveMember` + `membershipFor` | ~6 | |
| `cohortCounts` | 3 | M full rows |
| `digestFor` | 2 + N × (1 + 4) | M full rows, then per card: M vectors + a `document` scan |
| `cohortCards` in the page | 1 | M full rows |
| `peersFor` per card | N × 2 | M full rows + M vectors, per card |

The target shape is a constant number of queries plus one statement per
distinct kind of work, independent of N.

Reviewed 2026-10-17; the review's edits are folded in below and marked
where they changed a decision.

## Decisions

### 1. The session is memoised per request, in `src/lib/session.ts`, not in the auth library

`context(db?)` becomes a thin wrapper over `const resolve = cache(async () =>
…)` from `react`. The optional `db` argument stays for the call sites and the
tests but does not key the memo: `getDb()` returns the one handle, `getAuth()`
already pins itself to that handle (`src/auth/server.ts:32-39`), and no caller
passes a different one. The layout calls `currentVerifiedPerson()` and the
page calls `requirePerson(db)` in the same request; both hit the memo. React's
`cache` is per server request, falls back to no memo outside a render
(scripts, tests), and is the mechanism
`node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md`
"Deduplicating requests" names for ORM access. `redirect()` stays in
`requirePerson`, outside the cached function.

A `currentMembership()` in the same file wraps `membershipFor(db,
person.id)` in `cache()` the same way. `membershipFor` and `isActiveMember`
in `src/pilot/membership.ts` are **not** wrapped: `acceptInvitation`,
`revokeMembership` and the coming roster actions read membership and then
write it, and a memo there is the wrong place for it even if Next gives an
action body its own cache scope (see Risks). Pages derive `member` from the
one cached row (`status === "active" && revokedAt === null`, the predicate
`isActiveMember` already uses) and `operator` from the same row plus
`isPilotOperatorEmail`.

`canView` keeps its signature and gains an optional fourth argument:
`canView(db, viewerId, card, viewerMembership?)`. When the row is given the
viewer's membership query is skipped; when it is not (the token route
`src/app/api/lodestone/cards/[ideaId]/route.ts:23` and `src/lodestone/field.ts:37`,
neither of which has a session) it queries as today. Only the card page
passes the row.

**Testing note (from review).** The `react` build vitest loads is the
non-server one, whose `cache` is a passthrough
(`node_modules/react/cjs/react.development.js:917-921`); only the
`react-server` build memoises, and only inside a Flight request. So "resolved
once per request" is not observable in vitest. The unit tests cover the
identity bridge (decision 2); the dedupe itself is evidenced by the
measurement harness in task 0.1, which logs statements from the running dev
server behind an env flag.

**Interaction with `lodestone-publish`.** That change's design 1a introduces
`isOperator(db, person)` and makes `map/page.tsx:17-18` call it; this change
rewrites the same lines to read the cached row. Whichever lands second
reconciles: `isOperator` takes the membership row as an argument, so both
specs end at one predicate with one read.

### 2. The identity bridge selects before it inserts

`verifiedContext` in `src/auth/identity.ts` runs the select-join first. On a
hit it checks `row.person.email === authEmail.trim().toLowerCase()`, the same
normalisation `ensurePerson` keys on (`src/harness/ledger.ts:288-302`), which
is equivalent to today's `row.person.id !== personId` because `person.email`
is unique; a changed auth email throws on both paths. On a miss it runs
`ensurePerson`, the `INSERT … ON CONFLICT DO NOTHING` and the select-join
again, exactly as today, so two concurrent first requests remain safe. Net:
the common request does one query here instead of three plus a write attempt.

### 3. The page owns the cohort fetch; the helpers take what they are given

`cohortCards(db)` is called once per render. `digestFor` gains an options
field `{ cards?, cohort?, member?, vectors? }`; `peersFor` already takes
`candidates` and gains `vectors?: Map<string, IdeaVector[]>`. When given,
nothing is refetched. The callers that pass nothing (`/lodestone/digest`,
`sendDigests`, `field.ts`, the API routes, every existing test) keep today's
behaviour, so the signatures grow and nothing breaks. `cohortCounts.published`
becomes `count(*)` over the same join `cohortCards` uses. The page loads
`ideaVectors` once for `[...mine, ...cohort]` and hands the map to both
helpers.

Optional, if the "after" numbers still show `/lodestone` heavy: a lean
projection beside `cohortCards` without the `doc` jsonb, since the page needs
only `ideaId`, `title`, `line`, `publishedAt` and the owner. The map still
needs `doc` for `cardText` and keeps the full form.

### 4. Prior art for many cards is one statement

`priorArtFor(db, ideaId, k, since?)` is reimplemented over a new
`priorArtForMany(db, ideaIds, k, since?) → Map<ideaId, PaperHit[]>`.

- The `q` CTE gains a `card` column.
- **Candidates are keyed by card** (from review). In the no-`since` form the
  lateral keeps `q.card`, so `candidates` emits `(card, document_id)`: each
  card's set is the union of its own rows' top-k, which is the exactness
  argument in the function's comment, per card. `per_block` then joins `q on
  q.card = candidates.card`. A flat candidate set would score every card's
  rows against every card's candidates, N× the work and a different tie at
  rank k. In the `since` form the candidate scan is card-independent and is
  shared: `per_block` cross-joins `q` as today, once per request instead of
  once per card.
- `best` is `row_number() over (partition by card order by max(cos) desc,
  d.created_at desc, d.id) <= k`. **The order is made total** by appending
  `document_id`, in the single form too, because bulk-seeded rows share a
  `created_at` and today's cut at k is arbitrary among such ties. With a
  total order "deep-equal, order included" is a legitimate test.
- A card with no vectors maps to `[]` and contributes no `VALUES` row (an
  empty `values` list is a syntax error; `priorArtFor` returns before any SQL
  today). The result map is seeded for every requested id.
- The meta select runs once over the union of hit documents; `heldPapers`
  reads the cards' docs in one `inArray` select.

`digestFor` and `cohortMap` call the many form. Acceptance is equality: for
every card in the seed, the many form's hits equal the single form's, order
included, with and without `since`.

### 5. The `document (source, created_at)` index

Declared first in `src/db/schema.ts` on the `document` table
(`index("document_source_created_idx").on(t.source, t.createdAt)`), then
`npm run db:generate` emits `0015_document_source_created.sql`. Declaring it
only in SQL would have the next generate emit a `DROP INDEX`. It serves the
`since` candidate select and `corpusSummary`'s `max(created_at)` per source.
No change to the HNSW index.

### 6. The model SDK leaves the graph by moving three symbols, not by splitting `forge.ts`

The chain is `cards.ts → forge.ts → { extract/anchor, extract/core,
extract/ladder, founder/conversation }`. `anchor.ts` is pure. The other three
reach `harness/model.ts`. The review walked the static import graph and
confirmed that cutting exactly these three edges clears every module under
`src/lodestone`, `src/app/lodestone`, `src/app/api/lodestone` and `src/db`,
plus `src/lib/session.ts`, `src/auth/identity.ts` and
`src/pilot/membership.ts`; `ledger.ts`, `canonical.ts`, `founder/repeat.ts`,
`founder/subjects.ts` and `papers/openalex.ts` carry no model edge, and
`src/engine/turn.ts` imports the SDK as a type only. The cut:

- `TURN_SEPARATOR` moves to `src/harness/canonical.ts` (which `forge.ts`
  already imports) and `conversation.ts` re-exports it.
- `claimExtractionRun` moves to a new leaf `src/harness/extract/runs.ts`
  **together with the privates it closes over**: `cachedRun`, `nextAttempt`
  and the `RunKey` type (`core.ts:86-165`). `ExtractDeps` moves with it and
  its two `typeof` references become `import type { structured } from
  "../model"` and `import type { embed } from "../embed"`, so the leaf cannot
  re-import the SDK by accident. `extract/core.ts` re-exports all of them;
  its callers do not change.
- `ladder` is imported lazily: `const { ladder } = await
  import("../extract/ladder")` at the one call site, which runs only when
  `--ladder` is requested, never from a Lodestone route.

Proof is two tests. (1) A vitest that mocks `@/harness/model` with a factory
that throws and imports `@/lodestone/cards`, `@/lodestone/vectors` and
`@/app/api/lodestone/client`; `vi.mock` is hoisted and its factory runs on
first import of the resolved id, and the alias and the relative `../model`
resolve to the same file, so a throw means the module was reached. Two
caveats: `import type` edges never trigger it (correct, Turbopack erases them
too), and the lazy ladder import is never evaluated, so the test says nothing
about what `--ladder` loads. (2) A static import-graph walk over
`src/lodestone/**`, `src/app/lodestone/**`, `src/app/api/lodestone/**` and
`src/db/**`, `import type` excluded, asserting no path reaches
`src/harness/model.ts`, `src/engine/cli-model.ts` or `@anthropic-ai/sdk`;
this covers the requirement's whole module set, not three entry points.

`src/engine/cli-model.ts` additionally gets `/* turbopackIgnore: true */` on
the two dynamic `path.join` calls so the whole-project trace warning cannot
return through another entry.

### 7. Production traces exclude PGlite and local data

`next.config.ts`: `outputFileTracingExcludes: { "*":
["./node_modules/@electric-sql/pglite/**",
"./node_modules/@electric-sql/pglite-pgvector/**", "./data/**",
"./evals/**"] }`. Next 16.3.4 matches the key with picomatch `contains:
true`, so `"*"` covers every route (verified in the review against
`collect-build-traces.js`). In production `getDb` requires `DATABASE_URL`
(`src/pilot/config.ts`), so the PGlite branch cannot run there; `data/` and
`evals/runs` are gitignored and never reach a Vercel build, and the entry
keeps a local `next build` honest. Dev and test are unaffected: tracing is a
build-time concern and PGlite is still imported at runtime.

### 8. Streaming from one shared promise, and no `loading.tsx`

`/lodestone` today derives the nameplate, the three insight figures, the
cohort rows' "nearest" captions and §03 from `digest` and `peersByCard`. The
page awaits `requirePerson`, computes `cards`, `membership`, `counts`,
`corpus`, `cohort`, and returns its tree, having started **one** promise,
`matches = loadMatches(db, person, cards, cohort, member)`, resolving to `{
digest, peersByCard, nearest, closest, fresh, rows }`. Four small async
server components (`Nameplate`, `Insights`, `CohortRows`, `ThisWeek`) each
`await matches` inside their own `<Suspense fallback>`; the fallback is the
section's existing `.empty` markup with its final dimensions so nothing
shifts. One promise, awaited four times, is one computation. The cards grid
shows "n peers" per tile from the same promise, so the tile's second meta
line is its own tiny Suspense boundary with a fixed-height placeholder. The
card page does the same with prior art and peers behind the nine blocks.

**`loading.tsx` is dropped** (from review). A route-level loading file puts
the page behind a Suspense boundary, and the `redirect("/login")` in
`requirePerson` then fires inside a stream: the response is already a 200
with headers sent, and the redirect becomes a meta refresh
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md:105`).
Every signed-out hit on `/lodestone/*`, including curl and health checks,
would change status. In-page `<Suspense>` has no such cost because the page
awaits `requirePerson` before returning any tree. Client navigations already
keep the layout chrome through the router cache, which is what the loading
file would have bought.

Tests render with `renderToReadableStream` from `react-dom/server`, which in
node renders async components under `Suspense` and streams them: the first
chunk carries the shell and the fallbacks, a later chunk the resolved
section. `renderToStaticMarkup` of the same tree renders the fallbacks
without throwing, so the existing page tests' shell assertions stay green.

### 9. The small guards

- `src/harness/embed.ts`: `signal: AbortSignal.timeout(20_000)` on the
  fetch; an abort surfaces as `voyage timeout after 20s` through the existing
  error path, so the import action shows it.
- `embedForgeRows` in `forge.ts`: one `UPDATE assertions SET embedding = v.e,
  embedding_model = $model FROM (VALUES …) AS v(id, e) WHERE assertions.id =
  v.id::uuid`.
- `src/app/api/lodestone/digest/route.ts`: `export const maxDuration = 300`.
- `personForToken`: stamp `lastUsedAt` only when null or older than five
  minutes. Optional; one small `UPDATE` per API call.
- `next.config.ts` `redirects()`: `/` → `/lodestone`, permanent false;
  `src/app/page.tsx` is deleted; the wordmark in `layout.tsx` links to
  `/lodestone` directly so a client navigation does not bounce.

## Risks / Trade-offs

- **React `cache` and server actions.** Next runs an action body in its own
  work-unit store before the re-render's Flight request starts, so a
  `currentMembership()` call inside an action most likely reads fresh and the
  re-render has its own memo (unverified at runtime). The design does not
  rely on that: the memo lives only in `src/lib/session.ts`, and membership
  writers call `src/pilot/membership.ts` directly.
- **Window function on the candidate scan.** `priorArtForMany` with `since`
  scores (chunks since the date) × (rows across all the request's cards) in
  one statement. For a member with many cards this is the same total work as
  today, in one planner pass; for the cron it is still per owner. If PGlite
  shows the statement slower than the loop for large N the fallback is
  chunking cards in groups of ten, not a return to one card per query.
- **Streaming changes the HTML order.** Suspense boundaries inject the
  deferred sections at the end of the stream with inline scripts. Visual
  tests that snapshot the final DOM are unaffected; anything reading the raw
  HTML of `/lodestone` in order would be. Nothing in the suite does.
- **`outputFileTracingExcludes` is a global exclude.** If a future route
  legitimately needs PGlite in production the entry must be scoped to the
  other routes. The comment on the entry says so.
- **Test mocks.** Every page test mocks `@/lib/session` with a factory that
  exports only what the page used at the time; pages that start importing
  `currentMembership` get `undefined` until the mocks grow. Task 1.4 lists
  them.

## Migration Plan

Five task groups; each leaves typecheck, tests and build green and can ship
alone. Order is by payoff: 1 (session), 2 (cohort and prior art), 3 (import
graph), then measure. **Group 4 (streaming) is conditional**: it runs only if
the warm dev-mode median for `/lodestone` after groups 1–3 is still above
400 ms, or if the pilot wants the first paint earlier regardless. Group 5
(guards) is independent and small. The measurement harness in task 0 runs
before task 1 and after each group so the numbers in `proposal.md` have an
"after" column in the final commit message.

## Measurements

`npm run lodestone:measure -- --email you@example.edu` against `npm run dev`
started with `LODESTONE_SQL_LOG=1`: local PGlite, the seed cohort (nine
members, seven published cards, five papers), the viewer an operator with one
published card. Five warm runs per route, medians. Statements are counted
from the server's own log, both drivers' migrations excluded.

**Before** (tree `7300163` plus the logger only, 2026-10-17):

| Route | Status | TTFB ms | Total ms | Statements | Writes |
| --- | --- | --- | --- | --- | --- |
| `/` | 307 | 119 | 120 | 6 | 1 |
| `/login` | 307 | 138 | 139 | 11 | 2 |
| `/lodestone` | 200 | 374 | 381 | 29 | 2 |
| `/lodestone/digest` | 200 | 210 | 215 | 19 | 2 |
| `/lodestone/map` | 200 | 567 | 569 | 47 | 2 |
| `/lodestone/tokens` | 200 | 152 | 154 | 12 | 2 |
| `/lodestone/cards/[ideaId]` | 200 | 317 | 319 | 23 | 2 |
| `/lodestone/cards/[ideaId]/field` | 200 | 256 | 258 | 22 | 2 |

This run is faster than the review's 770–950 ms for `/lodestone` (a warmer
machine, the same shape): the 400 ms gate in the migration plan is already
met before any change, so group 4 is decided on the pilot's wish for an
earlier first paint, not on this number. The statement counts are the
structural measure; the "writes" are the two `INSERT … ON CONFLICT` the
identity bridge attempts on every request.

**After groups 1–3** (2026-10-17, same seed copied to `data/pglite-perf`,
served on its own port and `distDir` because another session held the
default dev server; nine warm runs). Timings were taken while an unrelated
job held the CPU near 75%, so they spread widely between runs (`/tokens`,
whose work did not change, read 122 ms in one run and 249 ms in the next);
the statement counts do not move with load and are the result:

| Route | Status | TTFB ms | Statements (before) | Writes (before) |
| --- | --- | --- | --- | --- |
| `/` | 307 | 2 | 0 (6) | 0 (1) |
| `/login` | 307 | 90 | 4 (11) | 0 (2) |
| `/lodestone` | 200 | 261 | 15 (29) | 0 (2) |
| `/lodestone/digest` | 200 | 173 | 11 (19) | 0 (2) |
| `/lodestone/map` | 200 | 641 | 15 (47) | 0 (2) |
| `/lodestone/tokens` | 200 | 249 | 5 (12) | 0 (2) |
| `/lodestone/cards/[ideaId]` | 200 | 588 | 14 (23) | 0 (2) |
| `/lodestone/cards/[ideaId]/field` | 200 | 528 | 15 (22) | 0 (2) |

The home page's count is now flat in owned cards: 11 statements for one
card and for three in `page.count.test.tsx`, against 16 and 28 before.
Rendered `<main>` of every route is byte-identical before and after group 2
(`lodestone:measure --save`).

**Build trace** (`npm run build`, no whole-project warning):
`.next/server/app/lodestone/page.js.nft.json` lists 207 files, 5.6 MB on
disk, against the review's 5,405 files and 277 MB. Nothing under
`node_modules/@anthropic-ai` or `node_modules/@electric-sql` is traced. What
is left of either: Turbopack's two symlink aliases and two stub chunks for
the excluded PGlite packages (never loaded in production), and one SDK chunk
reached only through the lazy `--ladder` import in `forge.ts`, which ships
in the function but is not evaluated at cold start.

**After** (every group but 4, 2026-10-17, same setup, the CPU back near
50%, nine warm runs):

| Route | Status | TTFB ms (before) | Statements (before) | Writes (before) |
| --- | --- | --- | --- | --- |
| `/` | 307 | 2 (119) | 0 (6) | 0 (1) |
| `/login` | 307 | 113 (138) | 4 (11) | 0 (2) |
| `/lodestone` | 200 | 289 (374) | 15 (29) | 0 (2) |
| `/lodestone/digest` | 200 | 168 (210) | 11 (19) | 0 (2) |
| `/lodestone/map` | 200 | 293 (567) | 15 (47) | 0 (2) |
| `/lodestone/tokens` | 200 | 95 (152) | 5 (12) | 0 (2) |
| `/lodestone/cards/[ideaId]` | 200 | 243 (317) | 14 (23) | 0 (2) |
| `/lodestone/cards/[ideaId]/field` | 200 | 202 (256) | 15 (22) | 0 (2) |

Every route's `<main>` is identical to the "before" render, but for a
dev-mode stack trace inside `/login`'s redirect body.

**After the follow-up cuts** (`c6cd231`, 2026-10-17, same setup, five warm
runs). The cohort counts are one statement, prior art takes the vectors and
cards its caller already read, and the sign-in lookup joins the membership
row. Timings ran slower than the row above under the same background load
and are not comparable; the counts are the result:

| Route | Statements (after groups 0–5) | Writes |
| --- | --- | --- |
| `/` | 0 (0) | 0 |
| `/login` | 3 (4) | 0 |
| `/lodestone` | 10 (15) | 0 |
| `/lodestone/digest` | 8 (11) | 0 |
| `/lodestone/map` | 10 (15) | 0 |
| `/lodestone/tokens` | 4 (5) | 0 |
| `/lodestone/cards/[ideaId]` | 13 (14) | 0 |
| `/lodestone/cards/[ideaId]/field` | 14 (15) | 0 |

`page.count.test.tsx` now reads 7 statements for one card and for three
(the session read is mocked there), guarded at 8. One more statement per
request is available from better-auth's `cookieCache`, at the cost of a
revoked session staying valid until the cookie cache expires; not taken.

**Group 4 skipped.** `/lodestone` was under the 400 ms gate before this
change (374 ms) and after it (261 ms), and the pilot has not asked for an
earlier first paint. The design in decision 8 stands for when it does.

## Open Questions

- Whether the pilot wants the digest nameplate above the fold to wait for the
  digest (no Suspense on it, a slightly later first paint) or to stream in.
  The design streams it; a one-line change reverses that.
- `AbortSignal.timeout` at 20 s is a guess at Voyage's slow tail; the
  import action's own ceiling on Vercel is the function timeout. Adjust once
  production has a week of timings.
