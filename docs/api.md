# The client API

What Whetstone, or any client a member runs, may do against Lodestone. The
server stores, embeds once, ranks and serves. It calls no model, and nothing
here returns another member's thread, evidence sentences or contact details.
The contract between the two apps is this page plus the `forge-idea/3`
export format Whetstone writes (`/2` and `/1` are still accepted).

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

The import form as an API. The body is a `forge-idea/1`, `/2` or `/3`
export, whole. The card is filed under the token's person and embedded; the
ledger rows beneath it supersede, so sending the same idea again updates
rather than duplicates. An idea id that belongs to someone else is refused
with `400`.

A `/3` document may carry `already_have`: the papers the author already
holds, as `[{ "id", "title", "doi" }]` — ids and a title, never an abstract.
Today Whetstone lists the paper a paper-seeded idea started from. A prior-art
match against one of them comes back flagged `yours` rather than presented as
a find.

`201` on first import, `200` on update:

```json
{
  "card": { "ideaId": "…", "title": "fang-nest", "line": "…", "visibility": "private",
            "publishedAt": null, "updatedAt": "…", "confirmed": 7 },
  "created": true, "filed": 11, "superseded": 0, "embedded": 10
}
```

`embedded` is `0` when the server has no embedding key; the card is stored
and every match list is empty until one exists.

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
  "priorArt": [ { "documentId": "…", "title": "…", "score": 0.81, "blocks": ["Value proposition"],
                  "year": 2025, "venue": "…", "field": "…", "url": null, "yours": false, "addedAt": "…" }, … ],
  "peers": [ { "ideaId": "…", "title": "…", "line": "…", "owner": { "id": "…", "name": "…" },
               "publishedAt": "…", "score": 0.78,
               "shared": [ { "mine": "channels", "theirs": "channels", "similarity": 0.83 } ] }, … ],
  "feedback": [ { "kind": "paper", "targetId": "…", "verdict": "useful", "at": "…" } ]
}
```

Prior art is the ten closest papers, `yours` true for one the author listed
in `already_have` (matched by DOI or OpenAlex id — still returned, so they
see the corpus holds it); peers the ten closest published cards, present only
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
