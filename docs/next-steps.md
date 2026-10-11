# Lodestone — next steps

Written 2026-10-10 against the tree at `1fc0b77`. The app is healthy: `tsc --noEmit`
is clean and the suite passes (280 pass, 1 skip). Nothing is mid-flight. What follows is
the work the trim commit and `docs/lodestone.md` deferred, ordered so that each phase
leaves a deployable app behind it. Each phase ends with acceptance checks that must pass
before the next begins.

> **How to use this file.** In Claude Code: *"Read docs/next-steps.md. Do Phase 1 exactly
> as specified, then stop and show me the acceptance checks passing."* Repeat per phase.

## 0. Intent

Lodestone is the network, not the authoring tool. A card arrives as a `forge-idea`
export, is embedded once, and is matched against papers and peers; a director sees the
map; everyone gets a weekly digest. These rules do not change in any phase below:

1. No model is called on the server. Retrieval and ranking only.
2. `private` is the default and is one action away at all times.
3. The cohort sees the nine blocks, their origin marks and the owner's name. Never the
   thread, the evidence sentences or the run log.
4. A revoked member's cards fall out of every list without a write.
5. The map counts and names regions and shows no grade.

## Phase 1 — Finish the trim (housekeeping, half a day)

The Oct 1 trim removed 206 modules and left references to them. None of this is
product work, but one item is a production blocker.

### 1.1 Restore the production migration path

`npm run db:migrate` points at `scripts/migrate.mts`, which was deleted. `createPostgresDb`
only auto-migrates when `NODE_ENV !== "production"`, so a production Postgres currently
has no way to receive migrations.

- Recreate `scripts/migrate.mts`: open `DATABASE_URL` with postgres-js, run
  `drizzle-orm/postgres-js/migrator` against `./drizzle`, exit nonzero on failure.
- Keep it to that. The deleted version also ran preflight; preflight was deleted too and
  is not coming back in this phase.

### 1.2 Remove dead scripts from `package.json`

Delete the entries whose targets no longer exist: `pilot:check`, `pilot:rehearse`,
`pilot:cleanup`, `test:pilot:postgres`, `eval`, `bench`, `harness:ingest`, `harness:forge`,
`extract`, `seed:synthetic`, `recompute`, `followups`, `judgments`, `resources:refresh`,
`resources:demo`. Keep `dev`, `build`, `start`, `test`, `typecheck`, `db:generate`,
`db:migrate`, `lodestone:seed`, `lodestone:digest`.

### 1.3 Rebrand the shell

- `package.json` name → `lodestone`.
- `src/app/layout.tsx`: title "Lodestone", description "The campus idea network", wordmark
  "Lodestone", drop the "Business Thesis Card" kicker. The nav keeps Lodestone and Sign out.
- `src/app/login/page.tsx` and `src/auth/delivery.ts`: sign-in copy and email subject say
  Lodestone.
- `src/auth/return-path.test.ts`: replace the deleted-route fixtures with `/lodestone`,
  `/lodestone/map`, `/lodestone/cards/abc?x=1#peers`.
- Leave source comments that say "Thesis Forge" or "Forge" where they describe the
  export format or the ledger's origin. Those are accurate.

### 1.4 Rewrite the docs

- `README.md`: replace wholesale with the content of `docs/lodestone.md` plus the run,
  migrate and test sections. Delete the "Innovation MVP" section; every route in it is
  gone.
- `docs/lodestone.md`: becomes a pointer to the README, or is deleted.
- `docs/PILOT_RUNBOOK.md`: cut to what still exists: env settings, `db:migrate`, the
  operator email list, the digest scheduler. Remove the rehearsal, preflight and retention
  sections.
- `docs/research-mvp*.md`, `VERIFICATION.md`: move to `docs/archive/` with a one-line
  header saying they describe the pre-trim app.
- `.env.example`: remove `THESIS_MODEL`, `THESIS_EFFORT`, `THESIS_ENGINE`,
  `MATCHING_ENABLED`, `RESOURCE_CURATOR_EMAILS`, `HARNESS_*`, `OPENALEX_MAILTO`,
  `ANTHROPIC_API_KEY`. Confirm with grep that nothing in `src/` or `scripts/` reads each
  one before removing it. `ANTHROPIC_API_KEY` is read by `src/engine/models.ts`, which is
  still in the import closure; if nothing reachable from a route calls `defaultModel`,
  remove the key and note the engine as dormant in the README.

### Accept

1. `npm run typecheck` clean; `npx vitest run` green.
2. Every script in `package.json` resolves to a file that exists.
3. `DATABASE_URL=<postgres> NODE_ENV=production npm run db:migrate` applies 0000–0011 to
   an empty database. Verify with the local Docker Postgres the old rehearsal used, or a
   throwaway Neon branch.
4. `grep -rn "Thesis Forge" src` returns only comments.
5. `grep -rn "/ideas\|/library\|/resources" README.md docs/*.md` returns nothing outside
   `docs/archive/`.
6. The browser tab, wordmark and sign-in email all say Lodestone.

## Phase 2 — Invite a real cohort (blocker for any pilot, one day)

Today the only way to become a member is `enrollTestMember` in the seed script. The
membership model (`src/pilot/membership.ts`) still has `createInvitation`,
`acceptInvitation`, `revokeMembership` and `listPilotRoster`, but the routes that called
them were deleted. Nothing in `src/app` can enrol anyone.

### 2.1 Operator roster page

`/lodestone/roster`, operators only (same check as `/lodestone/map`).

- Lists the roster from `listPilotRoster`: email, kind, state, invited, accepted, revoked.
- Form: invite by email → `createInvitation`. The invitation email goes through
  `deliverEmail` and carries an accept link.
- Per row: renew, revoke. Revoke calls `revokeMembership`, which already cascades
  (cards fall out of every list, pending introductions cancel).

### 2.2 Accept route

`/lodestone/join/[token]`: requires sign-in, calls `invitationAcceptanceState` then
`acceptInvitation`, redirects to `/lodestone`. Mismatched email or expired token shows
the reason and nothing else.

### 2.3 Nav

The home page header shows "Roster" beside "Cohort map" for operators only.

### Accept

1. Operator invites `a@example.edu`; the outbox holds one email with a join link.
2. `a@example.edu` signs in, opens the link, lands on `/lodestone` as an active member;
   their imported card can be published.
3. A second person opening the same link sees "this invitation was sent to someone
   else" and is not enrolled.
4. Operator revokes `a@`; their published card disappears from the map, from every
   other member's peer list and from the digest, with no row deleted.
5. A non-operator requesting `/lodestone/roster` gets the same denial `/lodestone/map`
   gives.

## Phase 3 — Deploy and schedule (one day, after Phase 2)

No deployment, mail provider or production database exists yet. Both scripts open the
PGlite file directly and cannot run beside `next dev`, so production needs Postgres and a
scheduler.

- Postgres with pgvector through the Vercel Marketplace (Neon or Supabase). Set
  `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `AUTH_EMAIL_FROM`,
  `RESEND_API_KEY`, `PILOT_OPERATOR_EMAILS`, `VOYAGE_API_KEY`, `EMBEDDING_MODEL`.
- `scripts/lodestone/digest.mts` and `seed.mts` open `data/pglite` by path. Change both
  to `getDb()` so they honour `DATABASE_URL`. Seed stays development-only; refuse to run
  when `NODE_ENV=production`.
- Digest as a cron: an authenticated route `/api/lodestone/digest` (bearer
  `CRON_SECRET`) that does what the script does, and a `vercel.ts` cron entry for Monday
  07:00 America/New_York. Keep the script for local runs.
- Release step: `npm run db:migrate` before promoting.

### Accept

1. Preview deployment signs in with a real magic link delivered by Resend.
2. Operator invites, member accepts, imports a card, publishes, and sees prior art
   against the seeded corpus.
3. Hitting the digest route with the secret sends one email per card owner; without the
   secret it returns 401.
4. `db:migrate` against the production branch is idempotent on a second run.

## Phase 4 — A corpus worth matching against (two to three days)

Prior art is only as good as `CORPUS` in `evals/lodestone/cohort.ts`: five hand-written
abstracts. A real cohort needs hundreds to thousands.

### 4.1 Ingest command

`npm run lodestone:ingest -- --query "<topic>" --limit 500 [--since 2018]`

- Source: OpenAlex works endpoint, polite pool with `OPENALEX_MAILTO`. Abstracts come
  back as inverted indexes; reconstruct them.
- One `document` row (`source = "paper"`) and one `putArtifactText` per work, keyed on
  DOI or OpenAlex id so re-runs do not duplicate. Provenance carries doi, openalex id,
  venue, year, authors, url. The `document` table has no dedupe key today; add a
  unique partial index on `(source, title)` or a `provenance.doi` lookup, whichever the
  existing `putArtifactText` provenance makes cheaper.
- Embed through `embedPaperAbstracts` as the seed does. Resumable: a run that dies
  leaves rows without a vector and the next run embeds them.
- Rate limit to OpenAlex's published polite-pool ceiling and stop cleanly on 429.

### 4.2 Corpus surface

- `/lodestone/map` shows corpus size, sources and the date of the last ingest.
- The card page's "Prior art" section says which query set each hit came from.

### 4.3 Retune thresholds

`CLOSE` 0.75 and `PAPER_FLOOR` 0.6 were set on five abstracts. With a real corpus,
sample 20 cards × top-5 hits, have a human mark each hit relevant or not, and move the
thresholds to where precision at 5 is at least 0.6. Record the sample and the decision
in `evals/lodestone/thresholds.md`.

### Accept

1. One ingest run of 500 works completes, re-runs with zero new rows.
2. Killing the run mid-embed and restarting leaves no document without a vector.
3. A seeded card with a known near-neighbour paper in the corpus returns it in the top 3.
4. The thresholds file exists with the sample, the precision number and the chosen
   values.

## Phase 5 — Introductions (two days, needs a live cohort to be worth it)

`founder_introductions` and `founder_preferences` tables exist in
`src/db/matching-schema.ts`, and `revokeMembership` already cancels pending ones, but no
route reads or writes them. Peers are shown and cannot be contacted.

- Preferences: on `/lodestone`, a member opts in to being introduced. Default off.
- Request: on a card page, beside a peer hit, "Ask for an introduction". Both parties
  must have opted in; the request stores the pair and the shared blocks that justified it.
- Accept: the other member sees pending requests on `/lodestone`; accepting reveals both
  contact emails to both, by email, once. Declining is silent.
- Digest: pending requests appear in the recipient's digest.

### Accept

1. A member who has not opted in sees no "Ask" button on anyone's card and no one can
   request them.
2. A request between two opted-in members creates one pending row; the requester cannot
   create a second for the same pair.
3. Acceptance sends both emails; the email appears nowhere in the UI.
4. Revoking either member cancels the pending request.

## Phase 6 — Lighter capture (scope decision first)

Every card still depends on the Forge desktop app and its export file. The doc lists a
lighter capture client as not built. Before building, decide which of these it is:

- (a) A paste form on `/lodestone` that accepts the nine blocks as text and writes a
  `forge-idea/2` document with every entry marked `draft`. Smallest; keeps the import
  contract; a day of work.
- (b) A web version of Forge's canvas with a model behind it. This violates rule 1
  above and reopens the authoring app that was trimmed out. Belongs in the Thesis Forge
  spec, not here.

Recommendation: (a), after Phase 4, and only if a cohort member without Forge asks for
it. Not scheduled.

## Not in scope

Campus-wide tenancy, more than one cohort per deployment, any model call on the server,
synthetic customers, grades on the map. These are deferred in `docs/lodestone.md` and
stay deferred.

## Order and dependencies

```
Phase 1 (trim)  →  Phase 2 (invites)  →  Phase 3 (deploy)  →  Phase 4 (corpus)
                                                              ↘  Phase 5 (introductions)
Phase 6 waits on a request from a cohort member.
```

Phase 4 can start in parallel with Phase 2 since it touches only scripts and the
corpus; its threshold retune waits on a real cohort.

## Phase 7 — The Whetstone bridge (started 2026-10-11)

Lodestone is the published network; Whetstone (the Forge desktop app, in the
sibling repo `v0-whetstone`) is where a student thinks, with a model in the
loop. The bridge replaces the manual file import with an API Whetstone calls,
and sends the student's verdicts on matches back. The thread never leaves the
desktop; only the `forge-idea/2` export crosses, exactly as the import does.

### 7.1 Client API on Lodestone — done

`docs/api.md` is the contract. Member-minted bearer tokens at
`/lodestone/tokens` (`api_token`, sha256 only); `GET /api/lodestone/me`;
`POST`/`GET /api/lodestone/cards`; `GET`/`PATCH /api/lodestone/cards/<id>`
with blocks, prior art, peers and the owner's feedback; `POST`/`GET
.../feedback` writing `card_feedback` (`useful | known | not_relevant`, one
verdict per owner, card and target). Migration `0012_lodestone_api`.

### 7.2 Whetstone: connection and send

A Lodestone section in settings (server, token, "test connection" against
`me`). A Rust command, since the webview has no network capability on
purpose, that posts the export to `cards` and fetches the card back. A
"Send to Lodestone" action beside the existing export.

### 7.3 Whetstone: matches in the idea, with verdicts

Prior art and peers shown beside the canvas, each with the three verdicts
posting to `feedback`. The top hits handed to the model as turn context so it
can say which it already knows and which are new to it.

### 7.4 Lodestone: the atlas and the retune

A two-dimensional projection of cards and papers on the map page, from the
vectors already stored. `card_feedback` counts per paper feed the threshold
retune in Phase 4.3.
