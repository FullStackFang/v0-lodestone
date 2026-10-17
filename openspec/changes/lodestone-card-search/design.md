## Context

`importCard` files the ledger rows, embeds them and returns. `searchWorks`
pages OpenAlex keyword search by cursor; `ingestWork` writes one work
idempotently on DOI or OpenAlex id and skips the fetch when the id is known;
`embedPaperAbstracts` embeds any corpus document without a vector.
`priorArtFor` ranks in SQL. `cardBlocks(doc)` yields the nine blocks with
their entries. `scripts/lodestone/ingest.mts` writes `provenance.query`
(the operator's query text) — a pattern this change must not copy, since
`GET /papers/<id>` returns provenance whole to any token.

## Decisions

### 1. Background, inside the request's lifetime, with the limit declared

`after()` from `next/server` runs the search once the response is sent, on
the same function. `export const maxDuration = 300` on
`src/app/api/lodestone/cards/route.ts` and on the import action's route,
the Fluid-compute ceiling on Hobby and Pro. The real cost is not the nine
seconds of spacing but what follows: two to four hundred candidate works,
each Semantic Scholar hit resolved through `fetchWork` (one keyed OpenAlex
request at 25/s), a transaction per new document, then one embed batch.
Expect one to three minutes. `card_search.state` is `stale` when a row has
been `running` for five minutes; a stale row is re-queued on the next import
regardless of its hash. The limiter in `rate.ts` is per process; two
concurrent imports can trip a source's ceiling, which lands in
`sources.<name>.error` and is retried by the next import. A queue is the
upgrade if a cohort ever imports faster than that.

### 2. Three sources, one adapter, one document shape

| Source | Call | Limit | Adapter |
| --- | --- | --- | --- |
| OpenAlex semantic | `searchWorks({ semantic: true })` → `/works?search.semantic=<text>&per-page=50&api_key=…` | 1/s | `OpenAlexWork` → `ingestWork` |
| OpenAlex keyword | `searchWorks({ limit: 25 })` | shared 25/s | same |
| Semantic Scholar | `graph/v1/paper/search?query=…&limit=25&fields=externalIds,title,year,tldr`, `x-api-key` | 1/s | DOI → `fetchWork` → `ingestWork`; the TLDR is kept for `lodestone-hit-sentences`; no DOI → skipped and counted |

Semantic search is a flag on `searchWorks`, not a new module: the URL and
the page shape are the same, only the parameter differs, and OpenAlex allows
one of `search`, `search.exact`, `search.semantic` per request. The
semantic input is truncated at 2,000 characters by OpenAlex; the query
builder trims the entries, never the purpose.

Dedupe runs before any ingest: a hit whose DOI or OpenAlex id is already in
`artifact_texts.provenance` is counted `existing` and skipped by
`storedBySourceId`, the check `ingestWork` already makes.

### 3. The query text per block

```
semantic:  <purpose.l2>. <block label>: <entries joined by "; ">
keyword:   <top eight content words of the entries, by tf over the card>
S2:        same as keyword
```

Without `purpose`, semantic is the block alone and the card reports
`abstracted: false`.

### 4. `card_search` is the memory

```
card_search(idea_id, block, text_hash, state, started_at, finished_at,
            sources jsonb, found int, primary key (idea_id, block))
```

`block` is the block key. `text_hash` is sha256 of the block's entry texts
in canvas order. An import compares each block's hash to the row and queues
the changed ones and any row `running` past five minutes; blocks with no
entries delete their row. `sources` holds per-source counts (`new`,
`existing`, `skipped_no_doi`) and any error string. The card-level `GET`
field is the fold of these rows: `state` is `running` if any row is,
`stale` if any has run past five minutes, else `done`; a card with no rows
at all is `done` with `found: 0` so a client never polls a card that was
imported before this change; `found` is the sum of new documents;
`abstracted` is whether the document carried a purpose.

### 5. Provenance allowlist

A searched-in document's `artifact_texts.provenance` keys are a subset of
`{ doi, openalex_id, field, venue, year, authors, url, query_set, thin,
tldr }`. The route test for `GET /papers/<id>` asserts it. `query_set` is
the literal `card-search`.

### 6. Block keys on the hit

`hitFrom` adds `blockKeys: string[]` in the same order as `blocks`.
`docs/api.md` tells clients to send `blockKeys` in a verdict's `context`;
`lodestone-verdict-ranking` keys its table on them.

### 7. Field quota in Node over 3k candidates

`priorArtFor(db, ideaId, k)` asks SQL for `3k` best documents, then walks
them in score order taking a hit while its field's count is under three,
until `k` are taken. Null field is its own bucket. The candidate depth is a
known limit: a document outside the dominated fields appears only if fewer
than `3k` documents outrank it overall, so a short list can mean either few
fields or a deep single-field cluster. The eval's field count is what says
whether `3k` is enough; `6k` is the first thing to try if it is not.
`fieldQuota(hits, k, perField = 3)` is a pure function used by both
`priorArtFor` and the `scorePaper` reference path.

### 8. The digest window

`digestFor` passes `since` to `priorArtFor`, which scores every document
added since. That set now excludes `query_set = 'card-search'`. A member's
own searched-in hits reach them through the card page and Whetstone, not
through a mail every member gets.

### 9. Eval gate

`lodestone-eval-set` baseline before, with `--no-search`. Then: a run with
search on (which adds unmarked documents the metric cannot credit), so the
gate on search is MRR of the marked documents and mean distinct fields, not
P@5; then quota on; then purpose on for the ten cross-field cards. The
change is accepted when mean distinct fields rises by at least one, MRR of
marked documents stays at or above half the baseline (a floor against noise,
not a ceiling on finds: every relevant searched-in paper that outranks a mark
lowers it), and at least half of the searched-in papers in the top five of
ten sampled cards are judged relevant to the card. The numbers go in
`tasks.md`.

Decided 2026-10-16: the first draft asked that marked-document MRR not fall
at all, which search could pass only by finding nothing better than the
marks.

### 10. What `forge-idea/5` adds and what Lodestone does with it

`purpose: { l1, l2 }` at the top level, written by Whetstone
(`forge-idea-purpose` in that repo). Extra keys are ignored by the import
schema. Lodestone stores the document whole as it does today, reads `l1` and
`l2` for queries, and never projects, embeds, or shows them to anyone but the
owner; a test reads a published card as another member and asserts no
`purpose` in the response. `/4` and earlier remain accepted.
