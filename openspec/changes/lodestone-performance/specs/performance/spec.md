## ADDED Requirements

### Requirement: One session resolution per request

The system SHALL resolve the signed-in person and their membership row at
most once per server request, however many layouts, pages and components
ask. The identity bridge SHALL NOT attempt an insert when the session row
already exists.

#### Scenario: Existing session row
- **WHEN** `verifiedContext` runs twice for the same verified auth session
  against a PGlite handle with a statement log
- **THEN** the second call issues one select and no `INSERT` into `session`
  or `person`

#### Scenario: Layout and page in one request
- **WHEN** the measurement harness fetches `/lodestone` from the dev server
  with statement logging on
- **THEN** the log shows one better-auth session read, one `session`
  select-join and one `pilot_membership` select for that request

#### Scenario: Scripts outside a render
- **WHEN** `membershipFor` is called from a script or test with no React
  request
- **THEN** it behaves exactly as today, with no memo

### Requirement: Request cost independent of the number of owned cards

Rendering `/lodestone`, `/lodestone/digest` and `/lodestone/map` SHALL issue
a number of database statements that does not grow with the number of cards
the viewer owns or the cohort has published. The cohort list SHALL be loaded
at most once per render.

#### Scenario: One card and three cards
- **WHEN** `/lodestone` renders for a member owning one card, then for the
  same member owning three cards, against the same cohort, with a statement
  log on the test handle
- **THEN** the statement counts are equal

#### Scenario: Unchanged output
- **WHEN** the seed cohort renders `/lodestone`, the card page, the digest
  and the map before and after the change
- **THEN** every score, rank, caption and count is identical

### Requirement: Prior art for many cards in one statement

`priorArtForMany(db, ideaIds, k, since?)` SHALL return, for every card, the
same hits in the same order as `priorArtFor(db, ideaId, k, since?)`, in one
SQL statement plus one metadata select. Both forms SHALL order by best
cosine, then `created_at`, then document id, so the order is total. In the
no-`since` form each card's candidates SHALL be its own rows' nearest
chunks; a card with no vectors SHALL map to an empty list.

#### Scenario: Equivalence over the seed
- **WHEN** both forms run over every card in the seed cohort, with and
  without `since`
- **THEN** the per-card results are deep-equal, order included

#### Scenario: A card without vectors
- **WHEN** one of the requested cards has no embedded rows
- **THEN** the statement still runs for the others and that card maps to `[]`

### Requirement: The `document` table is indexed for the digest scan

The schema SHALL declare an index on `document (source, created_at)` and a
migration SHALL create it.

#### Scenario: Fresh database
- **WHEN** migrations run on an empty database
- **THEN** `document_source_created_idx` exists, and `npm run db:generate`
  afterwards emits no migration

### Requirement: No model SDK in the network's import graph

No module under `src/app/lodestone`, `src/app/api/lodestone`, `src/lodestone`
or `src/db` SHALL transitively import `@/harness/model`,
`@anthropic-ai/sdk` or `src/engine/cli-model.ts`, type-only imports
excepted.

#### Scenario: The throwing mock
- **WHEN** a test mocks `@/harness/model` with a factory that throws and
  imports `@/lodestone/cards`, `@/lodestone/vectors` and
  `@/app/api/lodestone/client`
- **THEN** the imports succeed

#### Scenario: The static walk
- **WHEN** a test walks the static import graph from every file under the
  four directories, `import type` excluded
- **THEN** no path reaches the three forbidden modules

#### Scenario: The build trace
- **WHEN** `npm run build` runs
- **THEN** no "Dynamic filesystem access causes tracing of the whole project"
  warning is printed, and `.next/server/app/lodestone/page.js.nft.json`
  lists no file under `node_modules/@anthropic-ai` or
  `node_modules/@electric-sql`

### Requirement: Slow panels stream, without changing response status

If adopted (see the design's migration plan), `/lodestone` SHALL send its
chrome, hero copy and the owner's cards grid before the digest and peer
matching complete, and the card page SHALL send the nine blocks before prior
art and peers complete. Matching SHALL be computed once per render however
many panels await it. A signed-out request to any `/lodestone/*` route SHALL
still answer with a redirect status, not a streamed meta refresh.

#### Scenario: First chunk before the digest
- **WHEN** the page tree renders through `renderToReadableStream` with the
  digest computation delayed by a test hook
- **THEN** the first chunk contains the hero heading, the first card tile
  and the fallbacks, a later chunk contains the digest rows, and the digest
  function ran once

#### Scenario: Signed out
- **WHEN** a request with no session cookie hits `/lodestone`
- **THEN** the response status is a 3xx to `/login`

#### Scenario: No shift
- **WHEN** a deferred section resolves
- **THEN** the section it replaces had the same block height, measured in
  the browser above and below the 900px breakpoint `DESIGN.md` names and
  at a 390px phone width

### Requirement: Bounded external calls and writes

The Voyage request SHALL abort after a fixed timeout and report it as an
import error; embedding vectors SHALL be written in one statement per batch;
the digest cron route SHALL declare `maxDuration`; `/` SHALL redirect
without rendering the layout. Optionally, a token's `last_used_at` SHALL be
written at most once per five minutes.

#### Scenario: Provider hangs
- **WHEN** the embedder's fetch never responds
- **THEN** the import action returns an error naming the timeout within the
  timeout plus one second, and the card rows already filed remain

#### Scenario: Root redirect
- **WHEN** `GET /` arrives
- **THEN** the response is a redirect to `/lodestone` and no session query
  runs
