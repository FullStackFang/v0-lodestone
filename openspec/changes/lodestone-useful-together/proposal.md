## Why

Post-MVP. The useful corpus builds up slowly: one verdict at a time, one
card at a time. `lodestone-verdict-ranking` uses an owner's `useful` marks
in two ways. In their own list, a document embedded close to a useful one
is boosted (`NEAR_USEFUL`). In the cohort, there is a prior keyed by block
vector, which is designed but off. Both find papers *like* the ones already
found. Neither finds the paper that turned out useful *beside* another one
without resembling it. That pairing is the one thing the literature has not
already written down.

Citations write down the existing connection. Two papers that cite each
other, or share most of their references, are known to belong together, and
a founder who found one will find the other through its reference list.
What we care about is the pair that members keep finding useful together
even though neither cites the other and their reference lists barely
overlap. That pair is a link the cohort learned and the field has not drawn.

OpenAlex already returns `referenced_works` on every work fetch and search
page that Lodestone reads. Keeping that list costs no extra request at
ingest, and the existing corpus can be backfilled for about a cent.

## What Changes

- **The known link: references, stored.** Each paper's OpenAlex
  `referenced_works` is kept as one `document_references` row: the paper's
  own W number and the W numbers it cites, as a `bigint[]`. `ingestWork`
  writes the row from the work it already fetched. A script backfills held
  papers 100 at a time with `/works?filter=openalex_id:W…|W…&select=id,referenced_works`.
  `known(A, B)` is true when A cites B, B cites A, or the Jaccard overlap of
  their reference lists is at least `KNOWN_COUPLING`. Cited works need not
  be in the corpus. The list stays out of `provenance`, so `GET /papers/<id>`
  is unchanged.
- **The learned link: useful together.** `together(A, B)` is the number of
  distinct active members, other than the viewer, who marked both A and B
  `useful` on the same card. It is counted from `card_feedback` at read time
  and grows with every verdict.
- **Surprise lifts a hit in the owner's own list.** Take a paper A that the
  owner marked `useful` on this card. A paper B qualifies when `together(A, B)`
  is at least `TOGETHER_MIN` (3) and `known(A, B)` is false. B joins the
  candidates even if it is not near the card. Its place is raised by
  `TOGETHER_BOOST`, and it carries `via: { useful: A, together: n }`. A
  candidate strongly known to A gets no boost and no `together`.
- **One `via`, extended.** `via.useful` keeps its meaning: the owner's useful
  paper this hit came through. The new optional `together` says that the
  reason is co-usefulness, not embedding closeness. A client that reads only
  `via.useful`, as Whetstone does today, still prints a true line. The
  `NEAR_USEFUL` neighbours stay. Boosts do not stack, and when a hit
  qualifies both ways, `together` names it.
- **Off until the cohort can carry it.** The learned link applies only when
  `PRIOR_MIN_CARDS` (100) distinct cards of active members have paper
  verdicts. This is the same gate and the same privacy rule as the verdict
  prior. With no reference rows, no co-marks, or the gate closed, every
  ranking is identical to today's.

## Capabilities

### New Capabilities
- `citation-links`: each paper's OpenAlex references are stored at ingest
  and by backfill, and the known link between two papers is read from them.
- `useful-together`: the learned link from co-marked `useful` verdicts,
  and the surprise boost it gives in the owner's own list.

### Modified Capabilities
- `verdict-ranking` (from `lodestone-verdict-ranking`): `via` gains an
  optional `together`; a second source of candidates for the owner.
- `paper-ingest`: `ingestWork` writes the reference row.

## Non-goals

- No co-citation yet. Co-citation needs a `cites:` query per paper, which
  spends budget, and is a later option on the same table.
- No reference rows for patents. Their citations are not OpenAlex ids.
- No new verdict, no UI to mark pairs. The pair is inferred from two
  ordinary `useful` marks on one card.
- No change to what a non-owner sees, and no verdict, person or card leaves
  the server. A count below `TOGETHER_MIN` is never shown to anyone.
- Not part of the MVP. No rows are added to `lodestone-mvp/tasks.md`.
