## Why

Every ranking change proposed for Lodestone — a field quota, verdicts that pull
neighbours, a cross-user prior — is a claim that the top ten got better. Today
the only yardstick is `evals/lodestone/thresholds.md`: sixteen hits on a
synthetic cohort, marked by a model, used once to move `PAPER_FLOOR`. There is
no fixed set a second run can be compared against, so no change can be shown
to have moved anything.

`docs/competitive-landscape.md` puts this first for a reason: the retrieval
and ranking changes behind it (`lodestone-card-search`,
`lodestone-verdict-ranking`) are only worth building if their effect can be
measured, and the measurement has to exist before the first of them lands.

## What Changes

- **A fixed eval set.** `evals/lodestone/eval-set/`: thirty cards as
  `forge-idea` documents, each with a marked relevant set — the corpus
  documents (by DOI, OpenAlex id or patent number) a human says bear on it,
  and for each the block it bears on. Twenty from the synthetic firms cohort,
  ten written against the ingested corpus so cross-field hits exist to find.
- **A distractor list.** About 950 DOIs from the six operator query sets the
  threshold retune used, committed, so the marked documents are ranked
  against a real corpus and not only against each other.
- **A runner.** `npm run lodestone:eval` loads the set into an isolated
  PGlite, ingests marks and distractors through the keyed OpenAlex lookup,
  imports the cards with search off, runs `priorArtFor` for each and prints
  precision at 5, recall at 10, mean reciprocal rank, and the count of
  distinct `field` values in each top ten. It writes the per-card table to
  `evals/lodestone/eval-set/results/<date>-<label>.md`.
- **A baseline.** The first `--no-search` run, against today's ranking, is
  committed as `baseline.md`. Every later change in this series quotes its
  before and after against it.

## Capabilities

### New Capabilities
- `prior-art-eval`: a fixed card set with marked relevant documents, and a
  command that scores the current ranking against it.

## Non-goals

- Not a threshold retune. The thresholds file stays as is; the eval set is
  what a retune would now be run on.
- Not a benchmark of embedders. One model, the one in `EMBEDDING_MODEL`.
- Patent marks are not in the first set; they follow the patent source.
- Real member cards are not in the set. When a cohort exists and consents,
  a second set can be built from theirs; this one has to exist first.
