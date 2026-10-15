## Why

The owner's statement of the product, 2026-10-15: a founder works an idea in
Whetstone; Lodestone, published, searches the open literature for it, says
which papers matter and where, and learns from the founder's verdicts as the
idea pivots, so the next founder with a similar idea is served better.
`docs/competitive-landscape.md` checked about seventy products and found no
one doing this. It also found the two data sources Lodestone depends on had
moved, that the server has never been deployed, and that nothing can enrol a
member.

The work is six changes. Each is written to stand alone, but their value is
in the order: measure, repair, publish, search, explain, learn. Done out of
order they either cannot be judged (ranking before an eval set), cannot run
(search before keys), or cannot be used (learning before members). This
change is the sequence, its gates, and the one place that says what "MVP
done" means for the server.

## What Changes

Nothing in code of its own. This change owns:

- **The order** of `lodestone-eval-set`, `lodestone-sources-repair`,
  `lodestone-publish`, `lodestone-card-search`, `lodestone-hit-sentences`,
  `lodestone-verdict-ranking`, after `lodestone-corpus-compact` lands.
- **A gate after each**: a check that must pass before the next change starts,
  recorded in this change's `tasks.md` with the date and the number.
- **The Whetstone handshakes**: which Lodestone change each Whetstone change
  (`whetstone-mvp` in `../v0-whetstone`) waits on, and the API shapes both
  sides build against.
- **The MVP definition**: one cohort member sends a card from Whetstone to
  the live server, sees papers found for that card with sentences, gives
  verdicts, changes a block, re-sends, and sees what moved. The verdict graph
  table is filling. The eval numbers are at or above baseline.
- **Archiving**: when every sub-change is archived, this one is.

## Capabilities

### New Capabilities
- `mvp-gates`: the ordered gates between the six changes and the definition
  of done.

## Non-goals

- Introductions (roadmap Phase 5), lighter capture (Phase 6), a second
  cohort, a custom domain, Google sign-in, any model call on the server.
- The cross-user prior turning on. It is built and fills; it applies at a
  hundred cards, which an MVP cohort will not reach.
- Re-tuning thresholds on real cards. That is the first thing after the MVP,
  on the eval set plus the cohort's verdicts.
