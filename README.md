# Thesis Forge

A business thesis workspace with private iteration, versioned publication,
component-level peer review, consent-based founder discovery, and grounded
research recommendations. The eight-gate conversation remains available
alongside a manual editor that does not require a model key.

The pack it operationalizes lives in `../experiments/thesis-forge/`; the spec is
`../openspec/changes/thesis-forge-app/`.

```bash
npm install
cp .env.example .env.local     # add ANTHROPIC_API_KEY for live turns
npm run dev                    # http://localhost:3000, PGlite under ./data/
npm test                       # vitest, in-memory PGlite, fake model
npm run typecheck
npm run eval -- greenloop      # founder-bot vs the engine (needs the key)
```

Migrations: `npm run db:generate` after editing `src/db/schema.ts`. PGlite and
nonproduction Postgres apply them automatically. Production uses the explicit
`npm run db:migrate` release step, followed by the read-only `npm run
pilot:check` preflight before traffic opens.

OneDrive: exclude `thesis-forge/node_modules/`, `thesis-forge/.next/` and
`thesis-forge/data/` from sync, the same way `src-tauri/target/` is.

## Innovation MVP

- `/ideas`: private ideas, editable methodology, experiments, revision history,
  feedback decisions, and explicit publication preview.
- `/c/[slug]?v=N`: immutable shared revision. Unlisted links are bearer-access;
  cohort revisions require verified sign-in. Revocation also removes discovery.
- `/library`: search the latest cohort publications by component and context;
  save attributed references without turning another idea's claims into evidence.
- `/me`: correct capabilities and needs, opt into discovery, request an
  introduction. Contact email is shown only after mutual acceptance.
- `/resources`: persistent idea needs, monitoring, recommendation feedback.
  Curators import source records at `/resources/import`; quoted claims and
  proposed applications are stored separately.

The implementation and pilot acceptance criteria live in four OpenSpecs:
[review and revisions](../openspec/changes/thesis-review-revisions/),
[component library](../openspec/changes/shared-component-library/),
[founder consent](../openspec/changes/founder-matching-consent/), and
[resource watch](../openspec/changes/idea-resource-watch/).
Local checks and deployment limits are recorded in [VERIFICATION.md](VERIFICATION.md).

### Sign-in and Deployment

Email entry alone never grants access. Use the one-time sign-in link. In local
development, without email delivery settings, test links are written to the
ignored `data/auth/outbox.jsonl` file. They are credentials: do not publish that
file or serve `data/` as static content. Restarting without a configured stable
secret invalidates development sessions. `BETTER_AUTH_URL` must exactly match
the app origin, including port and `localhost` versus `127.0.0.1`.

Production requires `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `AUTH_EMAIL_FROM`,
`RESEND_API_KEY`, `PILOT_OPERATOR_EMAILS`, and `DATABASE_URL`. The auth URL must
be the exact public HTTPS origin and the secret must contain at least 32
characters. Configure a verified sender and persistent Postgres with pgvector;
production refuses local PGlite. The existing unverified `tf_session` cookie is
no longer trusted. Existing ideas are recovered only after their owner's email
is verified. The release and recovery procedure is in
[the pilot runbook](docs/PILOT_RUNBOOK.md).

With local Docker running, `npm run pilot:rehearse` exercises the database
release using a temporary PostgreSQL 16/pgvector container. It runs migrations,
production preflight, membership/revocation/concurrency tests, scheduled refresh
and replay, retention cleanup, and backup/restore with a comparison of owner
history. It uses synthetic configuration and removes its database and container.
Node 22.16+ is required; no production credentials or mailbox are needed.

The repository's `Pilot verification` GitHub Actions workflow runs tests,
typecheck, the build, pilot OpenSpec validation, and this release rehearsal on
relevant pull requests and pushes to `master`. It becomes active once the workflow
is pushed; local verification does not imply a GitHub run or a deployment.

`RESOURCE_CURATOR_EMAILS` is a comma-separated verified-email allowlist. It also
protects the legacy harness, reader, annotation and reconciliation interfaces.
Each deployment has one invitation-only pilot roster. Verification alone does
not confer membership. Do not use this as a multi-tenant campus deployment
without adding cohort-specific membership and access checks.

### Resource Operations

Import only source text you are allowed to store. Preserve source identifiers,
dates, exact quotes and limitations; a recommendation is a suggested connection,
not a validated technical fit or a patent licensing opinion. No Cornell-wide
crawl or automatic background schedule is installed by these changes.

The UI refreshes only the signed-in owner's monitored needs. Infrastructure can
run the fenced global refresh for an exact daily 02:00 UTC slot:

```bash
npm run resources:refresh -- --help
npm run resources:refresh -- --slot 2026-09-06T02:00:00.000Z
```

For unattended refresh, have the scheduler render its own current slot and run
this command against the production database. See the pilot runbook for retry,
failure-notification, health, and cleanup behavior.
Do not run a separate CLI writer against a PGlite directory already open by the
dev server. Refresh fails explicitly above 1,000 source records or active needs;
the initial corpus should be curated and small. Notifications are in-app, with
deduplication and read/usefulness state; there is no outbound alert email.

The component library scans eligible cohort revisions before returning 24-item
pages. A materialized, indexed projection is a scaling follow-up, not required
for the first cohort. Founder discovery without embeddings uses an explicitly
limited fallback; neither ranked candidates nor proposed research applications
claim validated compatibility. Real participant outcomes remain pilot tasks.

## Harness

`src/harness/` is the innovation harness: a ledger of typed assertions
extracted from papers, decks, resumes, canvases and conversations, with the
provenance to reconcile a model's claim against a human's highlight. The spec
is `../openspec/changes/harness-ledger/`.

```bash
npm run bench -- vocab         # vocabulary diversity per facet, per prompt version
npm run bench                  # the six registered bench names
```

Three rules are load-bearing, and each is cheaper to read here than to
rediscover:

- **The drift gate is `npm test`.** Every harness test — this contract's and
  both tracks' fixtures — lives under `src/harness/**` and `evals/harness/**`
  and runs on `npm test`. A contract change that breaks a track's fixture is
  red, which is why the governance rule is not a sentence in a README but a
  failing build.

- **Offsets are UTF-16 code units, and no SQL slices a canonical text.**
  Postgres counts code points and JavaScript counts code units; they disagree
  on every astral character. `NORMALIZATION.md` is the specification and
  `canonical.test.ts` greps for the violation.

- **Assertions are supersede-only.** `ledger.ts` exports nothing that
  deletes. In production, run once against the database, naming the role the
  app connects as:

  ```sql
  REVOKE DELETE ON assertions FROM <app role>;
  ```

  It is a comment in `drizzle/0001_harness.sql` rather than a statement
  because the role name is deployment-specific. PGlite has no roles; there
  the rule is the absent export.

Embeddings are Voyage 3.5 at 1024 dimensions. Without `VOYAGE_API_KEY` the
harness still runs: assertions are written with a null vector, the run records
`stats.embedded = false`, and the next call embeds them once a key exists.
