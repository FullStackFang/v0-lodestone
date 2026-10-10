# Release runbook

One invitation-only cohort per deployment. Keep test accounts, local outboxes
and the seeded synthetic cohort out of the production database.

## Configuration

Every setting in `.env.example` outside the Optional block, stored in the
deployment's secret manager:

- `DATABASE_URL`: persistent Postgres with the `vector` extension available.
- `BETTER_AUTH_URL`: the exact public HTTPS origin, no path.
- `BETTER_AUTH_SECRET`: stable, at least 32 characters. Rotating it signs
  everyone out.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: Google sign-in. The OAuth
  client's authorized redirect URI is `<BETTER_AUTH_URL>/api/auth/callback/google`.
- `AUTH_EMAIL_FROM` and `RESEND_API_KEY`: a verified sender for the
  magic-link form, invitations and the digest. Optional if Google sign-in is
  on; without them the email form is hidden and the digest cron skips.
- `PILOT_OPERATOR_EMAILS`: the people who may open `/lodestone/map`.
- `VOYAGE_API_KEY` and `EMBEDDING_MODEL`: without them every match list is
  empty.
- `CRON_SECRET`: what Vercel sends the digest cron route.

Where the provider allows it, use a release role for migrations and a runtime
role for the app. TLS on every connection.

## Release

1. Back up the database through the provider before any migration.
2. `npm run db:migrate` with the release-role `DATABASE_URL`. This is the only
   production migration path. It is idempotent.
3. Deploy the same build and confirm a real sign-in through a controlled
   mailbox. Configuration present is not delivery proven.
4. Enrol operators, then invite members.

## Digest

`vercel.json` schedules `GET /api/lodestone/digest` every Monday at 12:00 UTC.
Vercel sends `Authorization: Bearer $CRON_SECRET`; without it the route
returns 401 and does nothing. It renders every card owner's weekly digest and
hands it to Resend. It calls no model. `npm run lodestone:digest` does the same
by hand against whatever `DATABASE_URL` is set.

## Local validation

```bash
npm test
npm run typecheck
npm run build
```

Local development uses PGlite under `./data` and the ignored
`data/auth/outbox.jsonl` for mail. `npm run lodestone:seed -- --me you@example.edu`
fills a synthetic cohort; `--set firms` is the larger demo set of fictional
"fang-" firms. Neither script may run while `next dev` holds the PGlite
directory open.

## Demo data on a deployment

To show the product before a real cohort exists, the seed may run against
the deployment database from a workstation: pull the production variables,
export them, and run the seed with `--set firms`. The script refuses only
when `NODE_ENV=production`, which the pulled file does not set. Every seeded
person's email ends in `.test`. Nothing cascades from a person row, so
clearing the demo before a real cohort means removing those people's cards,
memberships, invitations and ledger rows, and the `paper` documents, in one
transaction.

## Rollback

Keep the failed database for investigation. Restore the provider backup into an
isolated target, verify it, then switch the application connection. Record the
failing step, never the raw credential or error text.
