## 1. Membership routes

- [ ] 1.0 `isOperator(db, person)` in `src/pilot/membership.ts` with the map's predicate; `assertPilotOperator` and the map page use it; test a membership-kind operator passes
- [ ] 1.1 Failing route tests: `/lodestone/roster` denies a non-operator like `/lodestone/map`; invite by a membership-kind operator writes one roster row (`noticeVersion = "lodestone-pilot-v1"`, expiry fourteen days) and one outbox email with a `/lodestone/join/` link and sets `deliveryStatus`; revoke leaves the `forge_card` row and drops the card from `peersFor`, `cohortMap` and `digestFor` (by the active-membership join every list already makes; `revokeMembership` itself touches `card_revision`, not `forge_card`)
- [ ] 1.2 `src/app/lodestone/roster/page.tsx` + server actions `invite`, `renew`, `revoke` over `src/pilot/membership.ts`
- [ ] 1.3 Failing tests for `/lodestone/join/[token]`: addressee accepts and is active; another email sees "sent to someone else"; expired token sees "expired"
- [ ] 1.4 `src/app/lodestone/join/[token]/page.tsx`
- [ ] 1.5 Header: "Roster" beside "Cohort map" for operators only

## 2. Health and guards

- [ ] 2.1 `GET /api/lodestone/health`: five booleans, 200 or 503; `migrations` from `_journal.json`'s last `when` vs the migrations table (confirm the column name first); test with migrations current and with one missing
- [ ] 2.2 `scripts/migrate.mts`: prefer `DATABASE_URL_UNPOOLED`; print which URL's host it used
- [ ] 2.3 `scripts/lodestone/seed.mts`: refuse on `NODE_ENV=production` or a non-local host; test the predicate

## 3. The deployment

- [ ] 3.1 `npm i -g vercel`; `vercel link` to a project on this repo
- [ ] 3.2 Marketplace Postgres (Neon unless the runbook says otherwise) with the `vector` extension; confirm `DATABASE_URL` and `DATABASE_URL_UNPOOLED` on Production and Preview
- [ ] 3.3 Resend: verified sender; `AUTH_EMAIL_FROM`, `RESEND_API_KEY`
- [ ] 3.4 Set `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `PILOT_OPERATOR_EMAILS`, `VOYAGE_API_KEY`, `EMBEDDING_MODEL`, `CRON_SECRET`, `OPENALEX_API_KEY`, `OPENALEX_MAILTO` (Production); the same minus `CRON_SECRET` on Preview with its own `BETTER_AUTH_URL`
- [ ] 3.5 `vercel env pull` locally; `DATABASE_URL=<unpooled> NODE_ENV=production npm run db:migrate` against the production branch; run it twice; then once against the preview branch
- [ ] 3.6 `vercel deploy --prod`; `GET /api/lodestone/health` all true

## 4. First cohort

- [ ] 4.1 Owner signs in by magic link; opens `/lodestone/roster`; invites a second address; accepts; both appear active
- [ ] 4.2 Ingest one set against production: `npm run lodestone:ingest -- --source openalex --query "<pilot topic>" --since 2018 --limit 500` with the production `DATABASE_URL`
- [ ] 4.3 Mint a token at `/lodestone/tokens`; in Whetstone set the server and token; test connection; send a card; the panel shows prior art; publish; the map shows one card
- [ ] 4.4 Hit the digest route with and without the secret
- [ ] 4.4a Wait for the first scheduled Monday run: Vercel cron log shows the invocation, one member's inbox has the digest. Date:
- [ ] 4.5 `docs/PILOT_RUNBOOK.md`: providers chosen, variables as set (names only), the health route, the first-cohort steps above; `docs/next-steps.md` marks Phases 2 and 3 done with the date
