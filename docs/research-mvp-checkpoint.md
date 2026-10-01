# Resume: research MVP

User approved making the MVP concrete: enter an idea and unresolved need → review three cited suggestions → record which helped and the next action. Behavioral science and social connections were already chosen; do not ask for a domain again.

## Start here

Code is in Forge's `thesis-forge/` app, not the sibling Founder Central CLI. From `thesis-forge`, run `npm.cmd run resources:demo`, then open `http://localhost:3012/demo`. This signs into an isolated synthetic account, prefills an editable social-connections example, and installs three real-paper excerpt records. The user must submit to save an idea. The demo is loopback-only, uses `data/research-mvp` and `.next-research-mvp`, blanks external database/email configuration, and does not send mail.

Read `docs/research-mvp.md` for the walkthrough and source coverage; `docs/research-mvp-verification.md` for exact checks and limits. The demo was left running at completion, but rerun the command if the process has stopped. It creates a fresh sign-in link while preserving the local idea/need/feedback history.

## Implementation

- OpenSpec `openspec/changes/idea-resource-watch/`, section 4, extends the already implemented resource-watch feature.
- `src/resources/service.ts`: atomic `createResearchIdea`; reuse card creation, membership lock and need ownership. Helped feedback requires an action in existing `outcomeNote`.
- `src/app/new/actions.ts` and `page.tsx`: direct intake, followed by owner refresh; failed refresh redirects to saved work with a retry notice.
- `src/resources/suggestions.ts`: up to three per need, with stable ordering, dismissals excluded, optional remainder.
- `src/app/resources/page.tsx`: owned-idea scope, evidence and proposed applications, empty state, next-action feedback.
- Idea listing and detail preserve the direct idea description as a title fallback and link to research.
- `scripts/resources/demo.mts`, `social-sample.json`, and `src/resources/social-example.ts`: isolated demo and explicit example, not production seeding or a general semantic recommender.

No migration, production deployment, commit, outbound contact, scheduled monitoring, or human experiment was performed. Both repositories have substantial concurrent uncommitted work; do not reset, commit, or overwrite it incidentally. Other browser work shares the default Playwright tab: use a separate browser context/page for further verification.

## Verified and unfinished

### Latest: broader agent evaluation

Read `docs/research-mvp-evaluation.md` before proposing more features or asking the user to judge the demo. The user authorized independent scenario testing. A fixed 16-case matrix ran through real services against three excerpt records; six cases were reproduced in isolated browser pages. Only 6/16 expected source sets matched exactly, 8/15 returned suggestions were agent-relevant, and 2/6 negative cases stayed empty. Ordinary paraphrases/plurals fail; generic counts/words and negated interventions create false matches. The prepared example is not representative of general matching quality.

An additional service/browser reproduction showed old helped feedback appearing against a substantially changed need after refresh. Version the judgment separately or mark it historical. All three sources resolve and their selected quotes are supported, but condition/limitation fields are absent and recommended actions are fixed per source or generic.

Artifacts: `evals/resources/scenarios.json`, `evaluate.mts`, `baseline.json`, `browser-results.json`. Reproduce with `npx.cmd tsx evals/resources/evaluate.mts data/checks/research-scenario-evaluation-rerun.json`. This uses fresh in-memory PGlite. Browser tests added six clearly labeled synthetic evaluation ideas to the local demo; S04 was later edited for the feedback-version reproduction. Do not count these as real founder needs or usefulness judgments.

No production matcher, source sample, schema or app behavior changed in this evaluation. OpenSpec sections 5 and 6 record completed evaluation and three unimplemented follow-ups. The next engineering pass should improve relevance, feedback provenance and evidence context, then evaluate newly reserved scenarios. No user input is required to address those technical findings. Human usefulness and launch gates remain open.

Focused resource/intake/guard tests, typecheck, production build and strict OpenSpec validation passed. Browser verified three suggestions, feedback validation/persistence, deduplication, no-match behavior, unknown-card rejection, mobile width, and persistence after a server restart. Build retains two unrelated CLI-model tracing warnings.

The user can now try the software. The next useful input is whether the suggestions help them choose a next action. Retrieval is a shared-word baseline on a small collection; it does not guarantee three useful results for arbitrary text.

Founder Central's ten-card research package remains at `research-pilot/evaluation/behavioral-social-connections/` in the sibling repo. Only three short source-excerpt records were prepared separately for this app demo. The earlier hypothetical need and experiment proposals remain hypothetical. Authentic founder needs, human extraction sign-off, real usefulness judgments, source coverage/import expansion, retrieval comparison, and production/participant launch gates remain open. This completed software flow does not close those gates.
