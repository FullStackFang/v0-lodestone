## 0. Measure first

- [x] 0.1 `scripts/lodestone/measure.mts`: against a running dev server and a signed-in cookie, fetch each route five times warm and print median TTFB. Add an env flag (`LODESTONE_SQL_LOG=1`) that passes a drizzle `logger` into `createPgliteDb`/`createPostgresDb` and prints one line per statement with the request path, so per-request counts come from the server, not from vitest. Commit the "before" table in `design.md`
- [x] 0.2 Test support: `createPgliteDb` accepts `{ logger }`; a `countingDb()` helper beside `src/lodestone/test-embed.ts` (`src/lodestone/test-db.ts`) builds an in-memory handle with a counting logger and exposes `statements` (the shared test handle is a `globalThis` singleton built without a logger, so the counting handle is its own instance)

## 1. One session per request

- [x] 1.1 Failing test on `verifiedContext` against a counting handle: second call for the same auth session issues one select and no `INSERT` into `session` or `person`; a changed auth email throws
- [x] 1.2 `src/lib/session.ts`: `resolve = cache(async () => …)`; `context(db?)` calls it; add `currentMembership()` wrapped in `cache`; `redirect()` stays in `requirePerson`
- [x] 1.3 `src/auth/identity.ts`: select-join first; on a hit compare the row's email to `authEmail.trim().toLowerCase()`; on a miss `ensurePerson` + `onConflictDoNothing` insert + select, as today
- [x] 1.4 Layout and every page under `src/app/lodestone` read `currentMembership()`; `canView(db, viewerId, card, viewerMembership?)` with the row passed only from the card page (the token route and `field.ts` keep calling it without); delete the duplicate `isActiveMember`/`membershipFor` calls at the call sites. Grow the `@/lib/session` mocks in `src/app/layout.test.tsx`, `src/app/lodestone/page.test.tsx`, `cards/[ideaId]/page.test.tsx`, `cards/[ideaId]/field/page.test.tsx`, `map/page.test.tsx` (and `login/page.test.tsx` if it imports anything new) with `currentMembership`; drop the `@/pilot/membership` mock in `layout.test.tsx` once the layout stops calling it
- [x] 1.5 `next.config.ts` `redirects()` for `/`; delete `src/app/page.tsx`; wordmark in `layout.tsx` links to `/lodestone`; test the redirect status and that no session query runs
- [x] 1.6 Note in `openspec/changes/lodestone-publish/design.md` 1a: `isOperator` takes the membership row, so the map page's cached read and the roster's predicate are one function

## 2. Cohort once, prior art in one statement

- [x] 2.1 Failing equality test: `priorArtForMany` vs `priorArtFor` over every card in the seed cohort (`evals/lodestone/cohort.ts` + `testEmbed`, as `network.test.ts` builds it), with and without `since`; plus a card with no vectors in the request
- [x] 2.2 `src/lodestone/priorArt.ts`: add `d.id` as the last order key in the single form first (its own commit, equality test against the old output on the seed); then `priorArtForMany` with the `card` column, per-card `(card, document_id)` candidates in the no-`since` form, shared scan in the `since` form, `row_number() over (partition by card order by max(cos) desc, created_at desc, id)`, one meta select, one `heldPapers` read, result map seeded for every id; `priorArtFor` becomes a one-card call of it
- [x] 2.3 `src/db/schema.ts`: `index("document_source_created_idx").on(t.source, t.createdAt)` on `document`; `npm run db:generate` → `0015_document_source_created.sql`; test that the index exists after migrate and that a second generate is empty
- [x] 2.4 `cohortCounts`: `count(*)` for `published`; equality test against the old value
- [x] 2.5 `peersFor(db, ideaId, k, candidates?, vectors?)`; `digestFor(db, personId, since, now, { paperFloor?, cards?, cohort?, member?, vectors? })`; both refetch only what they were not given; `digestFor` calls `priorArtForMany` once and `Promise.all` over peers
- [x] 2.6 `cohortMap`: `cohortCards` once, `priorArtForMany` for all placed cards; `cohortCounts` no longer materialises cards
- [x] 2.7 `/lodestone/page.tsx`: one `cohortCards`, one `ideaVectors`, pass both down; failing count test on the counting handle: one card vs three cards, equal statement counts
- [x] 2.8 `sendDigests`: `cohortCards` computed once per run and passed to every owner's `digestFor`; `maxDuration = 300` on the cron route

## 3. The model leaves the import graph

- [x] 3.1 Failing tests: (a) `vi.mock("@/harness/model", () => { throw new Error("model reached") })` then import `@/lodestone/cards`, `@/lodestone/vectors`, `@/app/api/lodestone/client`; (b) a static import walk over `src/lodestone/**`, `src/app/lodestone/**`, `src/app/api/lodestone/**`, `src/db/**` (`import type` excluded, dynamic imports excluded) asserting no path to `src/harness/model.ts`, `src/engine/cli-model.ts`, `@anthropic-ai/sdk`
- [x] 3.2 `TURN_SEPARATOR` to `src/harness/canonical.ts`, re-exported from `conversation.ts`
- [x] 3.3 `claimExtractionRun`, `cachedRun`, `nextAttempt`, `RunKey` and `ExtractDeps` to `src/harness/extract/runs.ts`; `ExtractDeps`' two `typeof` references as `import type`; `core.ts` re-exports all; `forge.ts` imports from `runs`
- [x] 3.4 `forge.ts`: lazy `await import("../extract/ladder")` at the `--ladder` call site
- [x] 3.5 `src/engine/cli-model.ts`: `/* turbopackIgnore: true */` on the two dynamic `path.join` calls
- [x] 3.6 `next.config.ts`: `outputFileTracingExcludes` for pglite, pglite-pgvector, `data/**`, `evals/**`, with the comment from design 7
- [x] 3.7 `npm run build`: no whole-project warning; record the `/lodestone` nft file count and bytes next to the "before" numbers (5,405 files, 277 MB locally)
- [x] 3.8 Re-run 0.1. If `/lodestone` warm median is under 400 ms and the pilot does not ask for an earlier first paint, skip group 4 and say so in the commit

## 4. Streaming (conditional on 3.8) — skipped: `/lodestone` under 400 ms before and after; see design.md Measurements

- [ ] 4.1 `/lodestone/page.tsx`: `loadMatches` promise after `requirePerson`; `Nameplate`, `Insights`, `CohortRows`, `ThisWeek` as async server components under `Suspense` with the section's `.empty` markup as fallback; tile peer count behind its own boundary. No `loading.tsx`
- [ ] 4.2 Card page: nine blocks first; prior art and peers under `Suspense`
- [ ] 4.3 Failing test: render the page tree with `renderToReadableStream` from `react-dom/server`, a delayed `digestFor` mock; assert the first chunk has the heading, first tile and fallbacks, a later chunk the digest rows, and `digestFor` was called once. Existing `renderToStaticMarkup` assertions stay
- [ ] 4.4 Test: a request with no session cookie to `/lodestone` still answers 3xx to `/login`
- [ ] 4.5 Browser check at 1440px, 880px and 390px widths: fallback and resolved heights equal; screenshots into `.playwright-mcp/`

## 5. Guards

- [ ] 5.1 `src/harness/embed.ts`: `AbortSignal.timeout(20_000)`; test with a never-resolving fetch and fake timers
- [ ] 5.2 `embedForgeRows`: one `UPDATE … FROM (VALUES …)`; equality test on the written vectors
- [ ] 5.3 Optional: `personForToken` stamps at most every five minutes; test two calls in a minute write once
- [ ] 5.4 Re-run 0.1; put the "after" table in `design.md`; `npm run typecheck`, `npm test`, `npm run build` green
