# Research MVP verification — 2026-09-06

Scope: direct idea/need intake, grounded suggestions, persisted next-action feedback, and an isolated local demonstration. Plan: `openspec/changes/idea-resource-watch/`, section 4. No database migration or production deployment.

## Automated evidence

- New intake/feedback tests first failed because intake and selection were absent and an empty helped note was accepted. Those cases passed after implementation.
- `npm.cmd test -- src/resources src/app/new/actions.test.ts src/harness/papers/guards.test.ts`: 8 files, 41 tests passed.
- Added one database-failure rollback regression afterward; `npm.cmd test -- src/resources/service.test.ts`: all 8 tests passed. A database trigger rejects need insertion and verifies that no orphan idea remains.
- `npm.cmd run typecheck`: passed. An earlier run caught errors in a concurrently added Postgres test; those were corrected outside this task before the passing run.
- `npm.cmd run build`: passed. Two warnings concern dynamic filesystem tracing in the existing `src/engine/cli-model.ts`; that file was not changed by this work.
- Strict OpenSpec validation for `idea-resource-watch`: passed.
- Focused whitespace diff check: passed; Git reported only the workspace's LF/CRLF notices.

## Browser evidence

Used the real Next app, real server actions, existing auth library, and persistent local PGlite. The launcher creates a synthetic member and imports three real-paper excerpt records. Verification used isolated browser pages after another workspace operation navigated the shared tab; screenshots from that interrupted attempt were replaced.

1. `/new?example=social` showed editable example fields with no automatic idea save. Submission opened `/resources?card=…` with one owned need and three cited suggestions.
2. Marking Helped with an empty note returned a next-action validation error. Submitting an action saved it, and reloading preserved the text and helped state.
3. A repeat check reported one need checked and zero new recommendations; three suggestions remained.
4. A battery-recycling need returned zero suggestions and an explicit saved-work/no-match message.
5. A nonexistent card identifier returned HTTP 404. Service tests additionally cover foreign-owner mutation rejection and inactive/unowned intake.
6. Mobile viewport 390px showed all three suggestions with document width below the viewport. Desktop/mobile screenshots are in `data/checks/research-mvp-desktop.png` and `research-mvp-mobile.png`.
7. After stopping and restarting the server, the original idea, three recommendations, and next-action note remained. A fresh authenticated page reported no page errors.
8. The initial numeric-loopback URL exposed a development request-origin mismatch at the existing activity endpoint. The demo now consistently uses `http://localhost:3012`; an authenticated activity request returned 204. The production origin check was not weakened.

Screenshots and local test data are ignored working artifacts, not participant evidence. Source URLs and excerpt coverage are documented in `research-mvp.md` and the sample JSON. `sourceDate` records collection date for this sample.

## Review and limits

Reviewed server-derived identity, transaction boundaries, validation before mutation, refresh outside the save transaction, owner-scoped reads, stable suggestion ordering, escaped source/proposal text, labeled forms, pending/error states, and mobile overflow. No model call or outbound email is part of the demonstrated flow.

This verifies software behavior on a three-source excerpt collection. It does not establish useful recommendations for arbitrary needs, semantic retrieval quality, organizer approval, scientific efficacy, or readiness to launch a real pilot. Broader production and real-participant gates remain open in their existing specs.
