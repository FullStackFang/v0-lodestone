# research-review Specification

## Purpose
TBD - created by archiving change lodestone-research-review. Update Purpose after archive.
## Requirements
### Requirement: A question becomes a research folder
The `research-review` skill SHALL take a question (text or a file) and a slug. It SHALL write
`research/<slug>/` in the Lodestone repo containing:
- `question.md`
- `search.json`: the corpus search and `--openalex`, merged, from `lodestone:search`
- `review.md`
- `smoke-tests.md`
- `links.json`

Every command SHALL run with Lodestone as the working directory.

#### Scenario: Running on the popularity idea
- **WHEN** the skill runs with the author's popularity note and slug `popularity-quality`
- **THEN** `research/popularity-quality/` holds all five files

### Requirement: The review has a fixed shape and cites only search hits
`review.md` SHALL have these sections in order:
- What holds up
- What needs correcting
- What's already taken
- The real gap
- Top 5 studies
- Sequencing
- Biggest risk
- Sources

Every paper it names SHALL be cited by an `id` present in `search.json`.

#### Scenario: A claim about prior work
- **WHEN** the review says a direction is already taken
- **THEN** the sentence cites one or more ids from `search.json`

### Requirement: Smoke tests have six fields
`smoke-tests.md` SHALL hold one smoke test for each of the review's top 3 studies. Each SHALL
state these fields:
- hypothesis
- measurement
- threshold, a number fixed before running
- kill means
- data
- time

The time SHALL be 8 hours or less, the cost $20 or less, and the data SHALL be on hand or
fetchable within an hour.

#### Scenario: A smoke test with no threshold
- **WHEN** a drafted smoke test lacks a numeric threshold
- **THEN** the skill rewrites it before saving, and a smoke test without one is never saved

### Requirement: Links resolve to stored papers or are marked unresolved
`links.json` SHALL be `{ items: [{ text, kind, links: [{ id, relation, quote }] }],
unresolved: [...] }`, where:
- `kind` is one of `claim`, `gap` and `smoke_test`
- `relation` is one of `supports`, `contradicts` and `taken_by`

A validator (`npm run lodestone:research-links -- research/<slug>`) SHALL:
1. move any link whose id is not in `search.json` to `unresolved`, with the reason
   `not_in_search`
2. ingest every cited OpenAlex W-id through the existing `--list` path
3. map each W-id that stored to its document id
4. move each W-id that came back `no_abstract`, `short_abstract` or `not_found` to `unresolved`
   with that status

After validation, every `id` in `items` SHALL be a stored document id.

#### Scenario: An invented citation
- **WHEN** a link names an id that is not in `search.json`
- **THEN** the validator moves it to `unresolved` with reason `not_in_search`

#### Scenario: A cited OpenAlex work
- **WHEN** a link names a W-id from the search's OpenAlex hits that ingests successfully
- **THEN** the link's id becomes the stored document id

#### Scenario: A cited OpenAlex work with a short abstract
- **WHEN** the W-id ingest returns `short_abstract`
- **THEN** the link moves to `unresolved` with status `short_abstract`

