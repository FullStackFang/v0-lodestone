# The client API

What Whetstone, or any client a member runs, may do against Lodestone. The
server stores, embeds once, ranks and serves. It calls no model, and nothing
here returns another member's thread, evidence sentences or contact details.
The contract between the two apps is this page plus the `forge-idea/5`
export format Whetstone writes (`/4`, `/3`, `/2` and `/1` are still accepted).

## Authentication

A member mints a token at `/lodestone/tokens`. It is `lst_` followed by
sixty-four hex characters, shown once. Every request carries it:

```
Authorization: Bearer lst_...
```

A missing, unknown or revoked token answers `401`. The token acts as the
member who minted it, under exactly the rules the pages enforce: a card is
private by default, publishing needs active membership, and another member's
card is visible only when both are active members and the card is `cohort`.

Errors are `{ "error": "<sentence>" }` with `400` for a bad body, `404` for a
card the token may not see, and `401` for the token itself.

## Routes

### `GET /api/lodestone/me`

The connection test. Who the token is and what the network holds.

```json
{
  "person": { "id": "…", "name": "Nora Castellanos", "email": "nora@…" },
  "member": true,
  "cohort": { "members": 25, "working": 24, "published": 21 },
  "corpus": 15
}
```

### `POST /api/lodestone/cards`

The import form as an API. The body is a `forge-idea/1`, `/2`, `/3`, `/4` or
`/5` export, whole. The card is filed under the token's person and embedded; the
ledger rows beneath it supersede, so sending the same idea again updates
rather than duplicates. An idea id that belongs to someone else is refused
with `400`.

A `/3` document may carry `already_have`: the papers the author already
holds, as `[{ "id", "title", "doi" }]` — ids and a title, never an abstract.
Today Whetstone lists the paper a paper-seeded idea started from. A prior-art
match against one of them comes back flagged `yours` rather than presented as
a find.

A `/4` document is `/3` with a `support` array on each workspace: sentences
Whetstone's author weighed from a paper's abstract against a block, as
`[{ "block", "entry_key", "document_id", "kind", "title", "citation",
"sentence", "stance", "run_id" }]`. They are stored with the rest of the raw
document but not yet projected, embedded or ranked, and never become an
entry's evidence.

A `/5` document is `/4` with an optional top-level `purpose: { "l1", "l2" }`:
two sentences on what the idea does for whom, at two levels of generality,
with no product or market nouns. Other keys under `purpose` are dropped.
Lodestone reads it only to build search queries; it is never projected,
embedded, or returned to anyone but the owner.

`201` on first import, `200` on update:

```json
{
  "card": { "ideaId": "…", "title": "fang-nest", "line": "…", "visibility": "private",
            "publishedAt": null, "updatedAt": "…", "confirmed": 7 },
  "created": true, "filed": 11, "superseded": 0, "embedded": 10,
  "search": "queued"
}
```

`embedded` is `0` when the server has no embedding key; the card is stored
and every match list is empty until one exists.

`search: "queued"`: once the response is sent, each block whose text changed
since its last search is searched in OpenAlex (semantic and keyword) and
Semantic Scholar, and what comes back is ingested and embedded, typically
within one to three minutes. **The block entries and `purpose.l2` are sent to
OpenAlex and Semantic Scholar as search strings**; nothing else about the card
leaves the server, and nothing of the card is stored with the papers found.
OpenAlex data is CC0; Semantic Scholar data is ODC-BY, so a client that shows
a Semantic Scholar TLDR attributes it to Semantic Scholar.

### `GET /api/lodestone/cards`

The token's own cards, newest first, as `{ "cards": [summary…] }`.

### `GET /api/lodestone/cards/<ideaId>`

One card and what the network found for it. For the owner:

```json
{
  "card": { …summary },
  "owner": { "id": "…", "name": "…" },
  "blocks": [ { "key": "customer_segments", "label": "Customer segments",
                "entries": [ { "text": "…", "origin": "confirmed", "evidence": null, "segment": null } ] }, … ],
  "segments": [],
  "member": true,
  "corpus": 15,
  "search": { "state": "done", "finishedAt": "…", "found": 37, "abstracted": true,
              "sources": { "openalex_semantic": { "new": 20, "existing": 30 },
                           "openalex_keyword": { "new": 9, "existing": 16 },
                           "s2": { "new": 8, "existing": 12, "skipped_no_doi": 5, "error": "…" } } },
  "priorArt": [ { "documentId": "…", "kind": "paper", "querySet": "food-waste", "title": "…",
                  "score": 0.81, "blocks": ["Value proposition"], "year": 2025, "venue": "…", "field": "…", "url": null, "yours": false, "addedAt": "…" }, … ],
  "peers": [ { "ideaId": "…", "title": "…", "line": "…", "owner": { "id": "…", "name": "…" },
               "publishedAt": "…", "score": 0.78,
               "shared": [ { "mine": "channels", "theirs": "channels", "similarity": 0.83 } ] }, … ],
  "feedback": [ { "kind": "paper", "targetId": "…", "verdict": "useful", "at": "…" } ]
}
```

`search` is the card's search so far. `state` is `running` while any block
is searching, `stale` when one has run past five minutes (the next import
searches it again), else `done`; poll while it is not `done`. `found` counts
documents the searches added to the corpus; `sources` sums each source over
the blocks and keeps the last error, which the next import retries.
`abstracted` is whether the card carried a `purpose`. A card imported before
search existed reads `done` with `found: 0`.

Prior art is the ten closest papers and patents, ranked in one list by the
same cosine. `kind` is `paper` or `patent`; a patent's `url` is its Google
Patents page and its `field` is the CPC section. `querySet` names the ingest
set the document came from, `card-search` for one a card search brought in,
or `null` for a seeded abstract. `yours` is
true for one the author listed
in `already_have` (matched by DOI or OpenAlex id — still returned, so they
see the corpus holds it). Peers are the ten closest published cards, present only
when the owner is an active member. For a cohort card the token
may view but does not own, the response is `card`, `owner`, `blocks` and
`segments` alone.

### `PATCH /api/lodestone/cards/<ideaId>`

Body `{ "visibility": "cohort" }` or `{ "visibility": "private" }`. Publishing
needs membership; going private is never refused. Returns `{ "card": summary }`.

### `POST /api/lodestone/cards/<ideaId>/feedback`

What the owner thought of one match the client showed them.

```json
{ "kind": "paper", "targetId": "<documentId>", "verdict": "useful",
  "context": { "score": 0.81, "blocks": ["Value proposition"] } }
```

`kind` is `paper` (target a `documentId` from `priorArt`) or `peer` (target an
`ideaId` from `peers`). `verdict` is `useful`, `known` (the match was right
but the author already knew it) or `not_relevant`. One verdict per owner,
card and target; a second replaces the first. `context` is kept as sent, so a
later threshold retune can be judged against what the person actually saw.

`GET` on the same path lists the owner's verdicts for the card.

### `GET /api/lodestone/papers/<documentId>`

One paper or patent from the corpus, to any valid token: the `documentId` of
a `priorArt` hit, read in full.

```json
{
  "documentId": "…",
  "kind": "paper",
  "title": "…",
  "abstract": "…",
  "abstractHash": "…",
  "provenance": { "doi": "…", "openalex_id": "…", "authors": ["…"], "year": 2021,
                  "venue": "…", "field": "…", "url": "…", "query_set": "food-waste" },
  "citation": "A. Reader, B. Writer. (2021). Title. Venue"
}
```

`abstract` is the canonical abstract, the only text Lodestone stores; there
is no full text to return. Paper metadata comes from OpenAlex (CC0), so
nothing is withheld. A patent's provenance carries `patent_number`,
`assignees`, `inventors` and `cpc` instead of `doi`, `venue` and `authors`,
and its citation names the inventors and the patent number. An id that is
not a paper or patent, a card's idea id included, answers `404`. A paper a
card search brought in has `query_set: "card-search"` and may carry `tldr`
(Semantic Scholar's, ODC-BY); its provenance never names the card, the
query, or the purpose.

`abstractHash` is the stored hash of that abstract. Two reads with no
re-ingest between them return the same one. Keep it beside anything anchored
in the abstract, such as a `support` sentence. If a later read returns a
different hash, the abstract was replaced, and an anchored sentence may no
longer be a substring of it.

## What a client should do with it

1. After the member pastes a token, call `me` and show the name back.
2. When the member asks, send the idea's export to `cards`. Keep the returned
   `ideaId`; it is the idea's own id, so it is stable across re-sends.
3. Before a turn, fetch the card and hand the model the titles, scores,
   matched blocks and `yours` flags of `priorArt` and `peers`. The model may
   say which it already knows; the ones it does not are the point.
4. Beside each match the member sees, offer the three verdicts and post the one
   they choose.

What crosses is the export document, whole — the nine blocks, the seed's id,
the papers held, and the thread with the evidence quotes anchored in it —
exactly as the manual import does today. The server stores it under the
owner and shows the cohort the blocks and their origin marks alone; the
thread and the evidence sentences are read by no one but the owner.
