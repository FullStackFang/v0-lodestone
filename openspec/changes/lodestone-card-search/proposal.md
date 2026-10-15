## Why

Prior art is ranked against whatever an operator ingested by hand:
`lodestone:ingest --query "food waste"` and the like, run before anyone sent
a card. A card about something no one thought to ingest ranks against
nothing, and the "corpus" count on `/me` tells the member how big the net
was, not whether it was cast anywhere near them.

`docs/competitive-landscape.md` sets out the alternative to mirroring
OpenAlex: search it at import time, for this card, and keep only what came
back. OpenAlex now offers a semantic search (`search.semantic`, 1,024-dim, 50
results, one request a second) beside keyword search; Semantic Scholar's
search is free at one request a second and carries a TLDR for works whose
abstract OpenAlex lacks. Nine blocks of searching costs about a cent and a
couple of minutes in the background, and the corpus becomes the union of
everything every card ever pulled in.

Two things keep that from returning the founder's own field ten times. The
query has to be abstracted — a customer-segment entry is a topic search for
that segment's literature, and only an abstracted purpose finds the
operations-research paper that solves the same problem for someone else —
and the ranking has to cap how many hits one field may hold.

## What Changes

- **A search on import.** After a card is filed and embedded, Lodestone
  searches for it in the background: for each block with entries, one
  OpenAlex semantic search, one OpenAlex keyword search and one Semantic
  Scholar search. Hits are deduplicated by DOI and OpenAlex id, resolved to
  OpenAlex works, ingested through `ingestWork` and embedded. A Semantic
  Scholar hit with no DOI is skipped. The response to `POST
  /api/lodestone/cards` gains `search: "queued"`; `GET` gains `search: {
  state, finishedAt, sources, found, abstracted }`.
- **Abstracted queries.** A `forge-idea/5` document may carry `purpose: {
  l1, l2 }` — two sentences Whetstone's author wrote about what the idea does
  for whom, at two levels of generality, with no product or market nouns.
  Other keys under `purpose` are ignored. When present, `l2` leads every
  semantic query. When absent, the block text is the query and the card is
  marked `search.abstracted: false`.
- **Only changed blocks search again.** A `card_search` row per card and
  block holds a hash of the block's entry texts and when it was last
  searched. A re-import searches only blocks whose hash changed, plus any
  block whose row has sat in `running` past the stale window. This is the
  record `lodestone-verdict-ranking` reads for the pivot diff.
- **Block keys on a hit.** `PaperHit` gains `blockKeys` beside the labels in
  `blocks`, so clients and later tables key on `value_proposition`, never on
  "Value proposition".
- **Field quota.** `priorArtFor` takes three times as many candidates as it
  returns and fills the list greedily with at most three per `field`, a
  patent's CPC section counting as its field. Hits past the quota are not
  dropped from the corpus, only from the top ten.
- **Provenance says `card-search` and nothing of the card.** `query_set` for
  a searched-in document is the constant `card-search`; its provenance
  carries no `query`, no purpose, no idea id and no block text. The card it
  served is in `card_search`, which no token reads but the owner's, as state.
- **Searched-in documents stay out of other members' digests.** The digest's
  "new this week" window ranks only documents whose `query_set` is not
  `card-search`, so one member's private card does not surface its topic in
  everyone's Monday mail.
- **Card text leaves the server as a query.** Block entries and the purpose
  are sent to OpenAlex and Semantic Scholar as search strings. `docs/api.md`
  says so in one sentence; nothing else about the card leaves.

## Capabilities

### New Capabilities
- `card-search`: a card's blocks are searched across OpenAlex and Semantic
  Scholar on import, the hits ingested, and only changed or stale blocks
  searched again.

### Modified Capabilities
- `prior-art-ranking`: the top ten holds at most three hits per field; hits
  carry block keys.
- `card-import` (`docs/api.md`): the response carries the search state;
  `forge-idea/5` with `purpose` is accepted.
- `digest`: the weekly window excludes searched-in documents.

## Non-goals

- No mirror, no snapshot. Nothing is downloaded that a card did not ask for.
- No full text. Abstracts only, as before.
- No arXiv source. OpenAlex indexes arXiv; a fourth client, parser and
  limiter buys little recall for the MVP.
- No Semantic Scholar-only documents. A hit without a DOI is skipped rather
  than given a second provenance shape.
- No search on the cohort page or the map.
