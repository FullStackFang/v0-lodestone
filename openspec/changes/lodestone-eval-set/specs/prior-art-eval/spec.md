## ADDED Requirements

### Requirement: A fixed set of cards with marked relevant documents

The system SHALL keep, under `evals/lodestone/eval-set/`, thirty `forge-idea`
documents and, for each, a list of relevant corpus documents as `{ source,
id, block }` where `source` is `openalex` or `patent`, `id` is a DOI,
OpenAlex id or patent number, and `block` is one of the nine canvas block
keys. At least ten cards SHALL have a marked document whose `field` differs
from the field of the card's own domain.

#### Scenario: The set is well formed
- **WHEN** the eval set is loaded
- **THEN** there are thirty cards, every mark names a known block, and every
  mark's `id` resolves to one source identifier form

### Requirement: A command scores the current ranking against the set

The system SHALL provide `npm run lodestone:eval -- [--label <text>]
[--no-search]` which, in an isolated database, ingests every marked
document and every document in the committed distractor list, files every
card through the production import with search off when `--no-search` is
given, embeds both with the configured embedder, runs the production
ranking for each card with k = 10, and prints precision at 5, recall at 10,
mean reciprocal rank, and the mean number of distinct `field` values in the
top ten. It SHALL write a per-card table to
`evals/lodestone/eval-set/results/<date>-<label>.md`, marking each hit
relevant, distractor, unmarked, or wrong-block.

#### Scenario: A run produces the four numbers
- **WHEN** the command runs with `VOYAGE_API_KEY` set
- **THEN** it prints the four numbers and writes a results file listing, per
  card, its top ten with each hit marked relevant, unmarked, or wrong-block

#### Scenario: No embedder, no run
- **WHEN** the command runs without `VOYAGE_API_KEY`
- **THEN** it exits nonzero saying the eval needs the production embedder and
  writes nothing

### Requirement: A committed baseline

`evals/lodestone/eval-set/baseline.md` SHALL hold the results of the first
`--no-search` run, over marks plus distractors, against the ranking as it
stood before any change in this series.

#### Scenario: A later change cites the baseline
- **WHEN** a change to ranking is proposed
- **THEN** its tasks quote the four numbers from `baseline.md` and from a run
  with the change applied
