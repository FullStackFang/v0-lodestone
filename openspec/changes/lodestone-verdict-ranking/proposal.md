## Why

`card_feedback` holds every verdict a member gives on a hit — `useful`,
`known`, `not_relevant`, with the score and blocks they saw — and nothing
reads it but a threshold retune that has not happened. A member who marks a
hit `not_relevant` sees it again on the next read. A member who marks three
hits `useful` gets no more like them. A member who rewrites their customer
segment gets a new top ten with no word on what changed. And the one thing
the landscape review found no competitor doing — a graph of which papers
proved useful to which kind of idea, improving for the next founder — has
its table missing.

`docs/competitive-landscape.md` orders the three uses by cost and by when
they pay: per card from the first verdict, per pivot from the first re-send,
across users once a cohort has a hundred cards. This change builds the first
two and the schema of the third, with its application behind a constant.

## What Changes

- **Verdicts shape the card's own list.** A hit the owner marked
  `not_relevant` is excluded from their ranking. For each hit marked
  `useful`, its nearest corpus neighbours (by document vector, in pgvector)
  join the candidates, and a neighbour within `NEAR_USEFUL` (0.85) of a
  useful document gets `USEFUL_BOOST` (0.05) added to its ordering score. The
  hit carries `via: { useful: <documentId> }` so the client can say "because
  you found X useful". `known` changes nothing; it was a right match.
- **The pivot diff.** Each ranking a card is read with is snapshotted
  (`card_rank`). `GET /api/lodestone/cards/<id>` gains `changes`: against the
  last snapshot taken before the most recent import, which blocks changed
  (from `card_search`), which hits are new, which dropped, and which dropped
  hits had a `useful` verdict. Whetstone shows this as "since you changed
  your customer segment".
- **The verdict graph, schema only.** `paper_block_verdict(document_id,
  block, idea_id, person_id, verdict, block_embedding, at)`: one row per
  verdict, carrying the blended vector of the block the hit matched at the
  time. `recordFeedback` writes it. `priorArtFor` applies a prior from it
  only when `PRIOR_MIN_CARDS` (100) distinct cards in the cohort have
  verdicts; below that the table fills and the ranking ignores it. Rows of a
  revoked member are excluded at read time, never deleted.
- **Semantic Scholar recommendations are not used.** The useful set stays on
  this server.

## Capabilities

### New Capabilities
- `verdict-ranking`: an owner's verdicts exclude and pull neighbours in their
  own list.
- `pivot-diff`: a card read reports what changed since the last import.
- `verdict-prior`: a table of verdicts keyed by block vector, applied as a
  prior once the cohort is large enough.

### Modified Capabilities
- `prior-art-ranking`: exclusion, neighbour boost, and the gated prior.

## Non-goals

- No collaborative filtering, no learned model. The prior is a count
  weighted by vector closeness, in SQL.
- No cross-cohort sharing. One deployment, one cohort, one table.
- No change to what the cohort sees of another member's card. Verdicts are
  the owner's; the prior exposes no card, person or verdict to anyone.
