## Context

`ingestWork` (`src/harness/papers/ingest.ts`) fetches a work through
`fetchWork`, or takes one from a search page, and writes `document` and
`artifact_texts`. `provenanceOf` keeps the citation fields. `GET
/api/lodestone/papers/<id>` returns provenance whole to any token, and the
`PROVENANCE_KEYS` list in `src/lodestone/search.ts` is the allowlist the
route tests hold it to. `artifact_texts` is versioned per abstract text. A
document already held by DOI or OpenAlex id returns from `ingestWork` before
any fetch. Only the URL form of a paper's OpenAlex id is stored, in
`provenance->>'openalex_id'`, under a unique index (`0013`).

`card_feedback` has one row per (person, idea, kind, target). Only the
card's owner can write one (`ownedCard` in `recordFeedback`). A paper
target is a uuid in `text`. `paper_block_verdict` repeats paper verdicts
with the judged block and its vector. `priorArtFor`
(`src/lodestone/priorArt.ts`) ranks in one statement. For the owner it adds
the `verdicts`, `excluded`, `useful`, `neighbours` and `via` CTEs. The
ordering key is `best_cos + USEFUL_BOOST` when `via` is set. `score` is
always the plain cosine. `applyVerdicts` is the pure reference. Whetstone
types `via?: { useful: string }` and prints "because you found <title>
useful" from `via.useful`
(`v0-whetstone/src/workspace/lodestone.ts` `viaLine`).

## Decisions

### 1. References live in their own table, one row per paper, as an array

```
document_references(document_id uuid primary key references document on delete cascade,
                    work bigint not null,          -- this paper's W number
                    cited bigint[] not null,       -- W numbers it cites; '{}' = fetched, none
                    fetched_at timestamptz not null)
```

Rejected alternatives:

- **A `provenance` field.** `GET /papers/<id>` would ship 30 to 40 ids to
  every token on every read, the allowlist would have to grow for data no
  client reads, and each new `artifact_texts` version would need the list
  copied.
- **An edge table `(document_id, cited)`.** It costs about 40 bytes a row
  against about 8 bytes an element. It only pays once something asks "who
  cites B", which is co-citation, a non-goal here.

W numbers are stored as `bigint`, not the URL string. They already exceed
2^31 (`W7165850525`). The table carries no foreign key to the cited works,
because most of them are not in the corpus and do not need to be. Bibliographic
coupling counts shared references whether or not those references are held.
Direct citation needs only B's own W number, and B is a corpus paper.

`work` is denormalised from provenance so the ranking never parses a URL.
Size: OpenAlex works average roughly 30 to 40 references. At 12,000 papers
that is about 5 MB of heap with only the primary-key index, small on Neon's
free tier and on PGlite. If co-citation comes later, it adds a GIN index on
`cited` or an edge table then.

The row's presence means the references were fetched. `cited = '{}'` means
OpenAlex lists none, which is common for preprints and older works. A
missing row means the references were never fetched. §3 treats the two
differently.

### 2. Written at ingest for free, backfilled for about a cent

`OpenAlexWork` gains `referenced_works?: string[] | null`. `ingestWork`
writes the row in the transaction that writes the document, from the work
it holds. The single-work fetch and keyword and semantic search pages all
return the field by default. (Check semantic search in 1.1. If its results
omit it, the backfill picks those papers up.) A held paper returns early and
writes nothing. The backfill covers it.

`scripts/lodestone/references.mts` selects papers with an `openalex_id` and
no `document_references` row. It asks
`/works?filter=openalex_id:W1|…|W100&select=id,referenced_works&per-page=100`
under `openalexLimiter`. OpenAlex allows up to 100 values OR'd in one filter,
and `select` takes top-level fields, which `referenced_works` is. That is one
list request per 100 papers: about 120 requests and about $0.012 for 12,000
papers. An id OpenAlex does not return (merged or deleted) gets no row and
is listed. The script is idempotent and resumable, and it prints any
`meta.notice` the way `ingest.mts` does.

### 3. The known link

```
known(A, B) = B.work = any(A.cited) or A.work = any(B.cited)
              or jaccard(A.cited, B.cited) >= KNOWN_COUPLING
```

`KNOWN_COUPLING` is 0.1, provisional. It is set from the eval's distribution
(§7), not guessed. A pair where either side has no row, or where both cited
lists are empty, is **unknown**, not weak. An unknown pair gets no surprise
boost, because "rarely cited together" is a claim and the server makes it
only when it has the evidence. Patents never have a row, so they are never
surprises. They still get `NEAR_USEFUL` neighbours as before.

Co-citation (C cites both A and B) is the stronger and more standard signal.
It needs either an OpenAlex `cites:` query per paper, which spends budget on
every ingest, or a corpus large enough that in-corpus citers suffice. It is
a later change, and it would add terms to `known()`.

### 4. The learned link, counted at read time

For the owner's useful set U on the card being read:

```
together as (
  select u.document_id as a, b.target_id::uuid as b,
         count(distinct a2.person_id)::int as n
  from useful u
  join card_feedback a2 on a2.kind = 'paper' and a2.verdict = 'useful'
                        and a2.target_id = u.document_id::text
  join card_feedback b  on b.idea_id = a2.idea_id and b.person_id = a2.person_id
                        and b.kind = 'paper' and b.verdict = 'useful'
                        and b.target_id <> a2.target_id and b.target_id ~* UUID
  join pilot_membership m on m.person_id = a2.person_id
                          and m.status = 'active' and m.revoked_at is null
  where a2.person_id <> $owner
  group by u.document_id, b.target_id
  having count(distinct a2.person_id) >= TOGETHER_MIN)
```

- **Distinct members, not distinct cards.** With cards, one prolific member
  with three cards could produce a "cohort" signal alone, and the count could
  then reveal one person's verdicts. With members, `TOGETHER_MIN` (3) is a
  k-anonymity floor. That is the privacy rule of the verdict prior
  (`lodestone-verdict-ranking` §6), applied per pair. The user's
  description said "distinct cards". This is the deliberate correction, and
  it is flagged as an open question.
- **The viewer is excluded.** The owner's own co-marks on their other cards
  are already known to them.
- **Card level, not block level.** The surprise worth finding is usually
  across blocks: a paper useful for the segment beside one useful for the
  value proposition. Requiring the same `blockKey` would cut those pairs, and
  many verdict contexts name no block. The same-block variant is one join to
  `paper_block_verdict` and is run as an eval row (§7), not shipped.
- **Only `useful`.** `known` means the match was right but told the member
  nothing. Counting it would teach the ranking what members already have.
- Uses the existing `card_feedback_target_idx (kind, target_id)`. At cohort
  scale this is a few hundred rows. A materialised pair table is the upgrade
  only if a read shows it.

### 5. Surprise in the ranking: owner-only, gated, bounded

Three more CTEs run only when the viewer is the owner (§1 of
`lodestone-verdict-ranking`) and the gate is open:

- **`surprise`**: rows of `together` where `known(a, b)` is false, `b` is in
  the corpus, `b` is not excluded, and `b` is not A itself. Each `b` keeps
  its `a` with the largest `n`, with ties going to the smaller id.
- **`candidates`**: gains `union select b from surprise`, the same way
  `neighbours` joins. B need not be near the card, because the point is that
  it is not.
- **Ordering key**: `best_cos + greatest(near ? USEFUL_BOOST : 0,
  surprise ? TOGETHER_BOOST : 0)`. The boosts do not stack. `TOGETHER_BOOST`
  is 0.05, the same as `USEFUL_BOOST`, and provisional. `score` stays the
  cosine. `fieldQuota` still applies, so a surprise from another field takes
  a field slot like any hit.

**The gate** is `PRIOR_MIN_CARDS` (100) distinct `idea_id`s in
`card_feedback` with a paper verdict whose owner is an active member. It is
checked once per read by a scalar subquery. Whichever of this change and the
verdict prior lands first defines `PRIOR_MIN_CARDS` in `priorArt.ts`. The
other change imports it.

`applyTogether(hits, surprise)` is the pure counterpart, next to
`applyVerdicts`. The reference-vs-SQL test covers both.

### 6. The `via` shape: extend, don't replace

```ts
via?: { useful: string; together?: number }
```

- `useful` is the owner's useful document the hit came through, as now.
- `together` is present only for a surprise. It is n, the count of other
  members (≥ `TOGETHER_MIN`) who found both useful. There is no
  `rarelyCited` flag: `together` appears only when `known()` is false, so the
  flag would always be `true`.
- `usefulWith` is not introduced. Renaming the key would break Whetstone's
  `viaLine`, which reads `via.useful`, and the meaning is the same.

A client says: "members who found <title> useful also found this useful;
the two don't cite each other". An old client says "because you found
<title> useful", which is still true. A non-owner never sees `via`.
`docs/api.md` documents `together` and the fact that it is never below
`TOGETHER_MIN`.

**Why `NEAR_USEFUL` stays.** It works from the owner's first verdict with no
cohort. The learned link needs a hundred cards and three agreeing members.
The two answer different questions: "more like this" and "what goes with
this". Replacing the first would take the only verdict effect away from
every member until the cohort is large. When a hit is both near and
together, `together` names it because it is the rarer, more informative
reason.

### 7. Eval: honest about what can be measured before real use

The eval set has no real verdicts, and no document is marked on more than
one of its 30 cards (86 marks, all distinct). Cross-member co-usefulness
therefore cannot be simulated from it. What can be done:

1. **Is low-known common among co-relevant pairs?** Backfill references for
   the eval corpus, which includes the marks. For every pair of marks on the
   same card (the simulated owner of `lodestone-verdict-ranking` §7 marks
   them all useful), compute `known()`. Do the same for random corpus pairs
   and for pairs from each card's plain top ten. Record the share with
   `known` false, and the Jaccard distribution, for each group. If
   co-relevant pairs are known about as often as top-ten pairs, the
   known/learned split carries little signal on this set. Record that, don't
   tune around it. This also sets `KNOWN_COUPLING`. The same-block variant
   is a second row.
2. **Mechanics, not value.** Seed synthetic agreement: for each card, three
   fake active members co-mark each pair of that card's marks. Mark one mark
   A `useful` as the owner and re-rank with `--no-search`. Record:
   - how often the hidden mark B enters the top ten with `via.together`;
   - that a known-strong B gets no boost;
   - that the gate closed gives an identical ranking;
   - with fake pairs of random documents, how many plain hits a surprise
     displaces.

   This proves the plumbing and bounds the harm. It cannot show value,
   because B is relevant by construction.
3. **The real read, in production.** After the gate opens (100 cards with
   verdicts), take the first N = 50 owner reads with a `via.together` hit.
   Compare the share of those hits later marked `useful` with the share among
   the hits they displaced (the plain ranking's k-th hits, computed alongside
   and not shown). The acceptance is "at least as often". Also report the
   share of qualifying pairs (`together ≥ TOGETHER_MIN`) with `known` false.
   All thresholds are provisional until this read. If it fails,
   `TOGETHER_BOOST` goes to 0 and the table stays.

## Constants (all provisional; `evals/lodestone/thresholds.md`)

| name | value | where |
|---|---|---|
| `KNOWN_COUPLING` | 0.1 | `priorArt.ts` |
| `TOGETHER_MIN` | 3 distinct other active members | `priorArt.ts` |
| `TOGETHER_BOOST` | 0.05 | `priorArt.ts` |
| `PRIOR_MIN_CARDS` | 100 | shared with the verdict prior |

## Open questions

- Distinct members (as designed) or distinct cards (as first described) for
  `together`? Members is safer and harder to game. Cards fills sooner in a
  small cohort.
- Is the 100-card gate right for a pair signal that already has a
  three-member floor? A lower cohort gate trades privacy margin for an
  earlier start.
- Should `known` verdicts count toward co-usefulness?
- Should a surprise be allowed into the digest, or only the card read? (As
  designed: card read only.)

## Asks from Whetstone (2026-10-17, `forge-idea/5`)

Whetstone's `forge-idea/5` export carries the papers an author brought and
confirmed through an OpenAlex look-up: `already_have` lists them all (seed
paper first), and each workspace gains `paper_links: [{ paper_id, entry_key,
block, evidence }]`, spread only when non-empty. Lodestone already accepts
`/5` and ignores the new keys. Two asks, both for this change, neither in the
MVP:

- **Author-brought pairs count toward `together`.** Two papers both in one
  idea's `paper_links` (or `already_have`) are a pair the author put side by
  side. Decide whether such a pair counts as one member's co-mark, like two
  `useful` verdicts on one card, and whether it is gated the same way.
- **A reason of the form "used with a similar segment".** When paper P
  appears in another idea's `paper_links` on a `customer_segments` or
  `value_proposition` entry whose vector is near this idea's, the hit can
  say so. This needs `paper_links` stored per card (paper id, block, entry
  key; never the evidence sentence, which is the other author's canvas) and
  a block-vector comparison, which `paper_block_verdict` already shapes.
