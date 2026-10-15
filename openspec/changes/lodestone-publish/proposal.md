## Why

Lodestone has never been deployed. Whetstone already points at
`https://v0-lodestone.vercel.app` by default and nothing answers there.
Phase 3 of `docs/next-steps.md` is mostly coded: `scripts/migrate.mts`
exists, both scripts honour `DATABASE_URL`, the digest cron route and its
`vercel.json` entry exist, `.env.example` lists every production setting.
What is missing is the deployment itself — a project, a Postgres with
pgvector, a mail sender, the variables — and the one piece of product Phase 2
asked for and nothing built: a way to enrol a member. Today the only path to
membership is `enrollTestMember` in the seed script, which refuses to run in
production. A deployed Lodestone with no members is a server where every card
stays private and no one can publish.

## What Changes

- **Operator roster.** `/lodestone/roster`, operators only (the
  `/lodestone/map` check): the roster from `listPilotRoster`; invite by email
  through `createInvitation`, delivered by `deliverEmail` with an accept link;
  renew and revoke per row through the functions `src/pilot/membership.ts`
  already has. "Roster" appears in the header beside "Cohort map" for
  operators.
- **Accept route.** `/lodestone/join/[token]`: requires sign-in, checks
  `invitationAcceptanceState`, calls `acceptInvitation`, redirects to
  `/lodestone`. A mismatched email or an expired token shows the reason.
- **Health.** `GET /api/lodestone/health`: unauthenticated; `{ ok, db,
  migrations, embedder, mail }` as booleans, no values. What the first deploy
  is checked against and what Whetstone's connection test can fall back to
  before a token exists.
- **The deployment.** A Vercel project on this repo; Postgres with pgvector
  from the Marketplace (Neon by default; the runbook names the choice);
  Resend with a verified sender; every variable in `.env.example` outside the
  Optional block set for Production and Preview; `npm run db:migrate` run
  with the release role before the first promote; `PILOT_OPERATOR_EMAILS`
  holding the owner.
- **Seed refusal.** `scripts/lodestone/seed.mts` exits before opening the
  database when `NODE_ENV=production` or `DATABASE_URL` is not local.
- **Runbook.** `docs/PILOT_RUNBOOK.md` gains the provider names, the exact
  variable list as set, the health route, and the first-cohort steps: mint a
  token, point Whetstone at it, send a card, see prior art.

## Capabilities

### New Capabilities
- `membership-invites`: operators invite, renew and revoke members; an
  invitee accepts by link.
- `deployment`: a live Lodestone with a health route, a migrated Postgres, a
  mail sender and the digest on a schedule.

## Non-goals

- No introductions (Phase 5), no lighter capture (Phase 6), no second cohort.
- No custom domain; the Vercel hostname Whetstone already defaults to is
  enough for a pilot.
- No Google sign-in setup; magic links by Resend are the one sign-in path for
  the pilot. The OAuth variables stay documented and unset.
