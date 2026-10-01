# Pilot release runbook

This application supports one invitation-only pilot per deployment. Keep test
accounts, browser fixtures, local outboxes, and synthetic corpora out of the
production database.

## Rehearse locally before configuring production

From `thesis-forge`, with Node 22.16+ and local Docker running:

```bash
npm run pilot:rehearse
```

This command creates a uniquely named PostgreSQL 16/pgvector container bound
to a random loopback port. It accepts no database URL or deployment target,
refuses remote Docker engines, and gives child commands synthetic configuration
instead of inherited deployment credentials. It performs these checks:

1. Apply the release migrations and pass production-policy preflight.
2. Confirm preflight exits nonzero when required configuration is missing.
3. Run real PostgreSQL membership, revocation, and concurrent-worker tests.
4. Execute one past scheduled refresh and verify replay returns the same run.
5. Execute the daily retention cleanup command.
6. Create a `pg_dump` backup, restore into a separate database, compare owner,
   idea, membership, publication, need, and refresh-run data, and pass preflight
   on the restored database.

It removes its exact container and anonymous volumes on success or a handled
failure/interruption. If the process is forcibly killed or Docker stops during
cleanup, use the printed `thesis-pilot-rehearsal-...` container name to remove
only that container and its volumes. No host database directory is mounted.
The image stays cached for later runs. No real email or model request is made.

This is a synthetic local rehearsal. Production still needs its own provider
backup/restore, TLS and runtime-role checks, mailbox delivery, and approved
scheduler and corpus. The refresh here exercises the existing synthetic test
need; it is not the 50–100-source production capacity measurement.

The repository workflow `.github/workflows/pilot-verification.yml` runs the
rehearsal alongside the full regression suite, typecheck, optimized build and
active pilot OpenSpec validation. It needs no repository secrets and uses a
read-only repository token. It runs on relevant pull requests, pushes to `master`,
or manual dispatch once pushed to GitHub. It neither installs the production
schedule nor deploys the app.

The Docker loopback binding and cleanup follow the
[Docker container reference](https://docs.docker.com/reference/cli/docker/container/run/).
Workflow permissions and triggers follow
[GitHub's workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).

## Required configuration

Set `DATABASE_URL` to persistent Postgres with pgvector. Set
`BETTER_AUTH_URL` to the exact public HTTPS origin with no path, and set a
stable `BETTER_AUTH_SECRET` of at least 32 characters. Configure
`AUTH_EMAIL_FROM` and `RESEND_API_KEY` for a verified sender. Set
`PILOT_OPERATOR_EMAILS` to the comma-separated verified operator addresses.
`RESOURCE_CURATOR_EMAILS` is independent. Store all values in the deployment's
secret manager; never place credentials in source control, command output,
screenshots, tickets, or verification evidence.

Use separate database roles where the provider permits it. The release role
may create extensions, schemas, tables, and indexes. The runtime role may use
application tables but cannot alter the schema. Apply the deployment-specific
`REVOKE DELETE ON assertions FROM <runtime role>` rule recorded in migration
0001. TLS is required for application, migration, and backup connections.

## Release procedure

1. Close application traffic and pause the scheduler. Confirm the approved
   origin, sender, operator list, participant roster, notices, source corpus,
   backup destination, and failure-notification destination.
2. Take a provider backup or `pg_dump` using the release role. Restore it to an
   isolated database, connect with the runtime role, and verify representative
   owner records before changing production.
3. In the maintenance window, run `npm run db:migrate` with the release-role
   `DATABASE_URL`. This is the only production migration path; application
   processes never migrate on connection.
4. Run `npm run pilot:check` with production configuration and the runtime-role
   `DATABASE_URL`. It reads connectivity, pgvector, and exact Drizzle migration
   history. It sends no email and exits nonzero on failure.
5. Deploy the same build, open traffic, and use an approved controlled mailbox
   to test real sign-in and invitation delivery. Configuration presence alone
   does not prove inbox delivery or backup restoration.
6. Start the documented scheduler only after its success and failure paths have
   been exercised. Invite approved participants after the operator gates are
   signed off.

Configure the infrastructure scheduler for 02:00 UTC every day. It must render
that occurrence as an exact ISO slot and invoke:

```bash
npm run resources:refresh -- --slot 2026-09-06T02:00:00.000Z
```

Replace the example with the scheduler's current slot; do not use wall-clock
time from an already-running worker. Exit zero means success or safe replay of
an already successful slot. Any other state exits nonzero. Connect that nonzero
exit to the approved external failure destination and test a controlled
failure before launch. The operator page distinguishes never run, running,
failed/interrupted, successful, and a success overdue by more than 26 hours.
Measure the approved 50–100-source pilot corpus on the chosen runner before
launch and retain the existing 1,000-resource/need bounds.

Run `npm run pilot:cleanup` daily after refresh to remove terminal operational
records and content-free daily activity older than 90 days. The seven-day
scheduled replay window is therefore always shorter than retained run history.

Participants make a separate optional choice under `/pilot/measurement`.
Declining never blocks product work. The operator report at
`/pilot/operator/report` uses active, currently consenting real participants;
it excludes operator/test enrollments and requires both parties for peer
metrics. The report shows UTC cutoffs, filters, counts, denominators, and
unavailable zero denominators. It contains no participant identities or free
text. Consent withdrawal deletes daily activity and changes later aggregate
views while preserving the participant's product records.

Local validation needs no production credentials:

```bash
npm test
npm run typecheck
npm run build
npm run pilot:check
```

The last command should fail with a sanitized configuration diagnostic when
production settings are absent. Local development continues to use PGlite and
the ignored `data/auth/outbox.jsonl` file.

## Failure and rollback

Do not print or paste the raw database, auth, or delivery error. Record only the
failing preflight check and its sanitized category. For a failed release, keep
traffic closed and fix forward with the membership-aware build. Do not run the
older verified-user build against migrated data because migration intentionally
withdraws cohort publications and discovery.

If recovery requires a restore, stop traffic and the scheduler, preserve the
failed database for investigation, and restore the reviewed backup through the
provider procedure into an isolated target first. Verify the target before
switching the application connection. A readiness pass does not substitute for
the restore exercise.
