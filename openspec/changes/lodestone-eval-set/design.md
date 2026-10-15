## Context

`evals/lodestone/cohort.ts` and `firms.ts` already build synthetic cards and
abstracts for the seed; `network.test.ts` ranks them with a hashed
bag-of-words embedder. The eval set is a third fixture of the same kind, but
its marks are the product, not its cards, and it runs with the real embedder
so the numbers mean something about production.

## Decisions

### 1. Thirty cards, marks by hand, marks say which block

Precision at 5 over thirty cards is 150 judgments: an afternoon by one
person, and small enough to redo when the corpus changes. Each mark names the
block the document bears on, so a later change that gets the paper right but
the block wrong is caught. The marked set is not claimed complete; recall at
10 is reported against it as a lower bound, and a hit outside the set is
"unmarked", not "wrong", in the per-card table.

### 2. The set references documents, it does not carry abstracts

A mark is `{ source, id, block }`. The runner ingests the referenced works
through `ingestWork` at eval time, so the set never holds a copy of an
abstract and never drifts from what ingest would write. That makes the
runner depend on a keyed OpenAlex lookup (`lodestone-sources-repair` §1):
a hundred single-work fetches on the keyless shared budget would not
finish. Patent marks wait for `lodestone-sources-repair` §2 and are added
as a second file when it lands; the first set is papers only. The ten
cross-field cards are written after the referenced documents are chosen,
not before.

### 3. Distractors, or the numbers mean nothing

A database holding only the marked documents would rank them against each
other and report recall near one for free. The runner also ingests a
committed distractor list, `distractors.txt`: the DOIs of the six operator
query sets the threshold retune used (`thresholds.md`, about 950 works),
fixed so every run sees the same corpus. The baseline is the ranking over
marks plus distractors. A hit that is neither marked nor a distractor cannot
occur on a `--no-search` run; on a run with search on it is reported as
`unmarked`, and P@5 on such a run is a number to record, not to gate on.

### 4. Isolated database, real embedder, `--no-search` by default

`THESIS_DATA_DIR=data/pglite-eval`, as the threshold retune did. Without
`VOYAGE_API_KEY` the runner refuses to start: a bag-of-words baseline would be
a number about the wrong system. Cards are imported through `importCard`
with search off (`--no-search`, the default until `lodestone-card-search`
exists, and the flag that keeps baselines reproducible after it does).
Cards and documents are embedded once and reused across runs; the embedder
is the only network call after the first run.

### 5. Four numbers, one of them about fields

Precision at 5 and MRR say whether the right things are near the top. Recall
at 10 says whether the list is long enough. Distinct fields in the top ten is
there because the whole series exists to surface cross-domain research; a
ranking can raise P@5 by returning the founder's own field ten times, and
this number is what catches it.

### 6. Results are files, baseline is committed

A run writes `results/<date>-<label>.md`. `baseline.md` is the first run and
is committed; later results are committed when a change cites them in its
tasks. Nothing is written to the main database.
