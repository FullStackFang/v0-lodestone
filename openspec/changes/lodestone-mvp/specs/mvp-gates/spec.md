## ADDED Requirements

### Requirement: The six changes are done in order, each behind a gate

The system's MVP SHALL be built in the order `lodestone-sources-repair`
section 1, then `lodestone-eval-set`, the rest of `lodestone-sources-repair`
and the code sections of `lodestone-publish` in parallel, then the
deployment, then `lodestone-card-search` with the search-independent
sections of `lodestone-hit-sentences` and `lodestone-verdict-ranking`
beside it, then the remainder of each, after `lodestone-corpus-compact`. No
change SHALL start a task that depends on another change until that
change's gate has passed and been written in `lodestone-mvp/tasks.md` with
the date and the observed values.

#### Scenario: A gate passes
- **WHEN** `lodestone-eval-set`'s tasks are all ticked and `baseline.md` holds
  the four numbers
- **THEN** the gate row is filled in and `lodestone-sources-repair` may start

#### Scenario: A gate fails
- **WHEN** the card-search eval shows marked-document MRR below baseline
- **THEN** work returns to `lodestone-card-search` and the search-dependent
  sections of `lodestone-hit-sentences` do not start

### Requirement: Ranking changes are judged against the eval set

Every change that alters ranking SHALL record, in its own tasks, the eval
set's four numbers before and after on `--no-search` runs, and SHALL be
accepted only when the mean reciprocal rank of marked documents has not
fallen below the committed baseline and, for `lodestone-card-search`, mean
distinct fields has risen by at least one.

#### Scenario: A ranking change is accepted
- **WHEN** `lodestone-verdict-ranking` records its `--verdicts --no-search` run
- **THEN** marked-document MRR on the affected cards is at or above the
  previous run

### Requirement: Each Lodestone change documents its own shapes

For each Lodestone change paired with a Whetstone change, the system SHALL
have the new response and document shapes written in `docs/api.md` by that
Lodestone change and by no other, and the Whetstone change SHALL build
against a fixture that names its source (the doc section, or the Lodestone
design until the section exists).

#### Scenario: Whetstone starts the purpose change early
- **WHEN** `forge-idea-purpose`'s first coding task begins before
  `lodestone-card-search` has written its doc section
- **THEN** the Whetstone fixture file says it was copied from
  `lodestone-card-search/design.md` and is re-checked against `docs/api.md`
  in the by-hand task

### Requirement: The MVP is done when the seven checks hold on production

The MVP SHALL be declared done only when, on the production deployment with
at least two members: a card sent with a purpose reaches `search.state =
done` with at least three distinct fields in its top ten and sentences on
every hit; whys are shown, with any thin hit at low confidence; a
`not_relevant` verdict removes a hit for the owner and not for another
member, and a `useful` one pulls in a neighbour with `via`; a re-send after
a block edit shows `changes`; `paper_block_verdict` has rows with the prior
off; the latest `--no-search` eval run is at or above baseline on
marked-document MRR and at least one above on fields; the digest has
arrived by a scheduled run.

#### Scenario: Declaring done
- **WHEN** all seven hold and are recorded with dates
- **THEN** each sub-change is archived and then `lodestone-mvp` is archived
