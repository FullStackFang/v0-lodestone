## Context

The membership model (`src/pilot/membership.ts`) has `createInvitation`,
`invitationAcceptanceState`, `acceptInvitation`, `renewInvitation`,
`revokeMembership` and `listPilotRoster`, all tested, with no route calling
them since the October trim. `revokeMembership` already cascades: cards fall
out of every list, pending introductions cancel. The deployment side has
`createPostgresDb` that migrates on connect outside production and
`scripts/migrate.mts` for production, a digest route under `CRON_SECRET`,
and `deliverEmail` that writes to an outbox without Resend.

## Decisions

### 1. Two server-rendered pages and one route, no client state

`/lodestone/roster` is a server component with a form posting to a server
action per operation (invite, renew, revoke), the same pattern
`/lodestone/tokens` uses. `/lodestone/join/[token]` is a server component
that reads the session, calls `invitationAcceptanceState` and either accepts
and redirects or renders the reason. No new client components.

### 1a. One operator predicate, and the membership functions honour it

`/lodestone/map` admits `isPilotOperatorEmail(email) || membership.memberKind
=== "operator"`; `assertPilotOperator` in `src/pilot/membership.ts` checks
the env list alone and requires a verified email, so a seed `--me` operator
would be refused by every roster action. One function, `isOperator(db,
person)`, holds the map's predicate; the roster page and `assertPilotOperator`
both call it. `createInvitation` takes `noticeVersion` and `expiresAt`: the
roster passes `"lodestone-pilot-v1"` and fourteen days. After `deliverEmail`
resolves, the invitation's `deliveryStatus` is set to `sent`, or `failed`
with the error, so the roster can show it.

**Reconciled with `lodestone-performance`**, which landed first:
`isOperator(person, membership)` already exists in `src/pilot/membership.ts`
and takes the membership row, not the handle. The layout, the home page and
the map read the row once per request through `currentMembership()` in
`src/lib/session.ts` and pass it in; the roster page does the same, and
`assertPilotOperator` reads the row with `membershipFor` (it runs inside
actions, outside the memo) and calls the same predicate. One predicate, one
read per request.

### 2. The accept link is the token, nothing more

`<BETTER_AUTH_URL>/lodestone/join/<token>`. The invitation row already binds
the token to an email; `invitationAcceptanceState` refuses a signed-in person
whose email differs. A second person opening the link sees "this invitation
was sent to someone else" and nothing else.

### 3. Health says whether, never what

`{ ok: boolean, db: boolean, migrations: boolean, embedder: boolean, mail:
boolean }`. `migrations` compares the last entry's `when` in
`drizzle/meta/_journal.json` (imported as JSON, so it is in the bundle; the
`.sql` files are not) with `max(created_at)` in `drizzle.__drizzle_migrations`
(drizzle stores the journal timestamp there — UNVERIFIED column name, check
in task 2.1). `embedder` and `mail` are `Boolean(env)`, not a probe; the
route must be cheap and must not spend a Voyage call per uptime check. No
version string, no counts, no hostnames.

### 4. Neon, pooled URL for the app, direct URL for migrate

Neon's Vercel Marketplace integration sets `DATABASE_URL` (pooled) and
`DATABASE_URL_UNPOOLED`. `scripts/migrate.mts` prefers the unpooled variable
when present, since drizzle's migrator holds an advisory lock the pooler can
drop. `createPostgresDb` keeps using `DATABASE_URL`. If Supabase is chosen
instead the same two-URL rule applies with its names; the runbook records
which.

### 5. Seed refuses by URL shape, not only by `NODE_ENV`

`seed.mts` exits when `NODE_ENV === "production"` or when `DATABASE_URL` is
set and its host is not `localhost`, `127.0.0.1` or empty. A developer with a
production URL in a local shell is the case this guards.

### 6. Preview deployments share nothing with production

Preview gets its own Neon branch (the integration does this) and its own
`BETTER_AUTH_URL`, so a preview sign-in never writes a production session.
Preview builds run with `NODE_ENV=production`, so `createPostgresDb` does
not migrate them either: `db:migrate` is run against the preview branch's
unpooled URL as a step, the same as production. `CRON_SECRET` is Production
only; the digest cron is not scheduled on preview.

### 6a. The cron is observed, not only hit

Hitting the digest route by hand proves the route. The definition of done
needs one scheduled run: the first Monday after deploy, the Vercel cron log
shows the invocation and one member's inbox has the mail. That is a wait,
and it is in the tasks as one.

### 7. Order of first release

Project linked → Postgres provisioned → variables set → `db:migrate` with the
direct URL → deploy → health green → operator signs in by magic link → roster
invites the owner's second address → accept → mint token → Whetstone connects.
Each is an acceptance check in `tasks.md`; none is skipped.
