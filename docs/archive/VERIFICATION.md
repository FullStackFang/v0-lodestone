> Archived 2026-10-10. This describes the pre-trim Thesis Forge app; none of its routes exist in Lodestone. Kept for the record.

# Innovation MVP Verification

Local verification date: 2026-09-06.

## Scope

Four changes are implemented in the existing `thesis-forge` app, not the parent
desktop application. OpenSpec proposals, designs, requirements and task lists
are under `../openspec/changes/`:

- `thesis-review-revisions`
- `shared-component-library`
- `founder-matching-consent`
- `idea-resource-watch`

## Automated Checks

- Full Vitest suite: 624 passed, one existing skip across 76 files, against real
  in-memory PGlite with fake model responses. The final legacy-cookie assertion
  was additionally verified by the three-test authentication suite.
- TypeScript check and optimized Next.js build.
- Fresh migration application and schema drift check through migration 0005.
- Strict OpenSpec validation for all four changes.
- Diff whitespace check.

Regression coverage includes verified-email ownership and one-time links,
publication allowlists and immutability, source revocation, author review
responses, experiment evidence rules, attributed component references,
consent-filtered matching, private-edit isolation, mutual contact disclosure,
curator authorization, anchored resource quotations, persistent recommendation
outcomes, and attribution-scoped extraction including concurrent claims.

The migration drift test compares actual migration contents before and after
generation. It permits an uncommitted worktree without permitting the test to
change migrations. Confidence and paper-tag guards still scan production
consumers, without treating fixture inserts or unrelated form fields as writes.

## Browser Environment

Local server: `http://127.0.0.1:3004`. Test state is isolated under
`data/verification-pglite`. External AI and email keys were blank; only local
`.invalid` test identities and synthetic research examples were used.

Screenshots are under ignored `data/checks/`. Development messages and server
logs may contain temporary sign-in credentials and must not be published.
Browser checks use desktop and 390px mobile viewports. They are functional
verification, not evidence of real student usefulness or successful startup fit.

Verified browser journeys:

- Two founders opt in, publish separate ideas, discover a proposed connection,
  request and accept an introduction. Neither contact email appears beforehand.
- Private edits leave a shared revision and its matching explanation unchanged.
  A peer submits component feedback and the owner records a visible response.
- Library search/filter, attributed save, revoked-source redaction and removal.
  Revoked publication links become unavailable and matching removes the idea.
- A curator creates an idea need, imports clearly synthetic anchored source text,
  refreshes recommendations, marks one read/helpful, and confirms persistence.
  Repeated refresh creates no duplicate recommendation.
- Wrong-owner private access is rejected. Signed-out private access reaches
  sign-in; cohort links return to the exact requested revision after sign-in.
- Review disposition, completed experiment evidence and sharing choice, founder
  preferences, and need monitoring/status remain correct immediately after save.

Eleven screenshots capture these flows; checked desktop and mobile views had no
horizontal overflow. No external messages, introductions or AI calls were sent.

## Remaining Deployment Work

- Configure production Postgres/pgvector, stable auth origin/secret and verified
  email delivery. Production authentication fails closed without configuration.
- Curate authorized research/patent source records and schedule the provided
  refresh command. No Cornell-wide crawl or scheduler is installed.
- Recruit consenting pilot participants and measure review usefulness,
  introductions, and changed business decisions. These OpenSpec pilot tasks
  remain open; synthetic browser tests do not satisfy them.
- Add explicit cohort membership before a multi-class or university deployment.
  The MVP treats verified users as one shared pilot cohort.

## Known Tooling Warnings

The build retains two existing filesystem-tracing warnings in
`src/engine/cli-model.ts`. Dependency audit reports four moderate findings in
the existing Drizzle/esbuild toolchain and no high or critical app findings.
No forced dependency downgrade was applied. These warnings require separate
deployment review; passing tests are not a blanket security certification.

## Pilot Launch Readiness Overlay

Local software verification on 2026-09-06 covers the one-roster-per-deployment
pilot overlay in `../openspec/changes/pilot-launch-readiness/`. Existing accounts
were not enrolled. Migration 0006 preserves owner history, withdraws cohort
publications, disables discovery, cancels pending introductions, and leaves
unlisted publication state unchanged. Migrations 0008–0010 add fenced refresh
operations, a seeded lock row, and optional content-minimizing measurement.

The final local checks were:

- 690 tests passed with three skips across 96 files, including fresh PGlite
  migration application and exact schema drift. Two skips are the opt-in real
  Postgres checks when `PILOT_POSTGRES_URL` is absent; those checks passed
  separately against the disposable PostgreSQL 16/pgvector container below.
- `npm run typecheck` and the optimized Next 16.3.4 build passed. The build
  retained the two pre-existing `cli-model.ts` filesystem-tracing warnings.
- `npm run resources:refresh -- --help` passed and documents the scheduled-slot
  contract. `npm run pilot:check` rejected missing production configuration with
  a sanitized nonzero result, as expected from a local shell.
- Strict OpenSpec validation and `git diff --check` passed.

The local test suite covers invitation expiry/replay and delivery failure,
membership revocation at participation and discovery boundaries, unlisted link
preservation, durable refresh progress/fencing/retries/cleanup, optional consent
and withdrawal, same-origin daily activity, and identity-free aggregate reports
with explicit windows and denominators.

Real Postgres verification passed in a disposable local
`pgvector/pgvector:pg16` container using PostgreSQL 16 with pgvector. The
explicit release migration command applied migrations 0000–0010 to a clean
database. Production preflight then passed configuration, connectivity,
pgvector, and exact migration alignment. The opt-in integration suite passed
transactional email-bound enrollment/revocation and simultaneous global-worker
fencing against the real server. No production credentials or data were used;
the container and its ephemeral database were removed after the check.

The Playwright browser transport closed before navigation, so the new pilot acceptance, operator,
revocation, refresh-recovery, and measurement browser journeys also remain open;
unit/render/API coverage is not recorded as browser evidence. Production
configuration, migration/restore, real mailbox delivery, scheduler notification,
approved corpus/roster/notices, and all real-participant observations remain the
explicit operator and participant launch gates in sections 7 and 8 of the
change tasks.

## Repeatable Operational Rehearsal

`npm run pilot:rehearse` passed locally on Windows with Node 22.16.0 and
Docker Desktop's Docker 29.6.1 engine. It created an isolated PostgreSQL 16
database with pgvector and exercised:

- Explicit migrations, production-policy preflight, and the controlled
  missing-configuration failure path.
- The two real PostgreSQL enrollment/revocation and concurrency contracts.
- Scheduled refresh, successful-slot replay with the same run ID, and daily
  retention cleanup.
- A custom-format `pg_dump`, restore into a separate database, matching
  fingerprints of owner/idea/membership/publication/need/run records, and
  production-policy preflight on the restored database.

Cleanup also succeeded on the failed development runs, and the final Docker
inventory contained no rehearsal containers. No production credentials, real
mailboxes, external model calls, or host database directories were used.

Fourteen new tests cover local-engine/loopback restrictions, environment
isolation, help without Docker, and redaction of accidental URL arguments.
The final full suite passed 690 tests with three expected skips; typecheck and
the optimized build passed with the two existing build warnings described above.

`.github/workflows/pilot-verification.yml` passed actionlint. It defines the
application checks and isolated release rehearsal for relevant pull requests,
pushes to `master`, and manual dispatch. It has not been pushed or run on
GitHub; a local pass is not a hosted CI or production-deployment claim.

Strict validation of `pilot-launch-readiness` passed. Repository-wide strict
OpenSpec validation additionally exposed four pre-existing failures in
`canvas-brevity`, `elevated-shell`, `forge-segments`, and
`posture-and-stress-loop`: their affected requirement text lacks SHALL/MUST.
Those unrelated artifacts were not changed. The CI OpenSpec step checks the
active pilot change and skips it once that change has been archived.

This rehearsal reduces manual release work but does not close tasks 6.3–6.4,
the chosen provider's TLS/role/restore and email/scheduler checks, the approved
corpus capacity measurement, or real-participant observation gates.

## Forge idea round trip (`forge-idea-bridge` 6.1)

Local verification date: 2026-09-21. One real Forge idea
(`d616041d-962f-4cb3-bfb8-5c9f442c7406`, one Business Model workspace, 20 live
entries) round-tripped through a scratch ledger. The Forge database was a
**copy** of `%APPDATA%\com.fullstackfang.forge\forge\forge.db`; the author's own
database was not written. No embedding provider and no model were called.

1. `export_idea_conn` over the copy, rendered by Forge's `renderIdeaJson` →
   `forge-idea/2`, `business_model:20`.
2. `THESIS_DATA_DIR=<scratch>/ledger npm run harness:forge -- export1.json` →
   20 written, 0 unchanged; evidence 1 anchored, 0 ambiguous, 19 unanchored;
   4 profile facts skipped; one `forge`/`none` run.
3. The same file again → 0 written, 20 unchanged, no run claimed.
4. One draft `key_resources` entry edited through `confirm_canvas_entry_conn` on
   the copy, re-exported: same `key`, origin `confirmed`, new text.
5. Import of the second export → 1 written (1 superseding), 19 unchanged.
6. Query: 20 `(framework, key)` pairs, every one with exactly one `active`
   assertion; 21 Forge rows in all (20 active, 1 superseded); 0 of 21 rows
   carry a vector; 2 `extraction_runs`, both `forge`/`none`/`ok`.

Two things the real idea showed that the fixture could not:

- **19 of 20 entries are unanchored.** Most of this idea's evidence came from
  intake of attached documents, not from the thread. That is the risk
  `design.md` names; exporting resource text hashes is the follow-up, not a
  looser anchor.
- **All 4 profile facts were skipped.** Forge's extraction names profile keys
  freely (`workshop`, `background`, …), and none carry the prefixes D11 maps
  (`skill_`, `credential_`, `network_`, `industry_`, `field_`, `location_`).
  Either Forge's prompt asks for prefixed keys or the table maps whole keys —
  a decision for the author, not a patch.

Suites at close: thesis-forge Vitest 719 passed / 3 skipped, `tsc --noEmit`
clean; Forge Vitest 505 passed, `tsc -b` clean, `cargo test` 161 passed.
