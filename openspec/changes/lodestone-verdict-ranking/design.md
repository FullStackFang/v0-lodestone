## Context

`priorArtFor` ranks in one SQL statement: block vectors as a `values` list,
candidates by HNSW per block, exact per-block cosines, best `k`. `hitFrom`
builds the hit from the per-block map and today names blocks by *label*
("Value proposition"); `lodestone-card-search` adds `blockKeys` beside
`blocks` so every table in this change keys on `value_proposition`.
`recordFeedback` upserts `card_feedback` with the client's `context`;
`card_feedback.target_id` is `text` and holds a uuid for a paper and a 32-hex
idea id for a peer. `card_search` (from `lodestone-card-search`) records
which blocks changed on each import and writes `card_rank` when a search
completes. Block vectors are `assertions` rows read by `ideaVectors`;
`blended` in `vectors.ts` averages by facet family and can return null, so it
is not the per-block vector this change needs.

The web card page (`src/app/lodestone/cards/[ideaId]/page.tsx`) calls
`priorArtFor` for any viewer who may see the card. Verdicts, neighbours and
snapshots are the owner's and must never shape what a cohort viewer sees.

## Decisions

### 1. Owner-only, by a `viewerId` the ranking takes

`priorArtFor(db, ideaId, k, { since, viewerId })`. The verdict CTEs below are
added to the statement only when `viewerId` equals `forge_card.owner_id`;
`changesFor` likewise. The `GET` route and the card page pass `person.id`;
the map and the digest pass the owner's id. A cohort viewer of a published
card gets the plain ranking with no `via` and no `changes`. A test reads a
published card as another member and asserts both are absent.

### 2. Exclusion and neighbours are CTEs, with the id cast guarded

```
verdicts  as (select target_id::uuid as document_id, verdict from card_feedback
              where person_id = $owner and idea_id = $idea and kind = 'paper'
                and target_id ~ '^[0-9a-f-]{36}$'),
excluded  as (select document_id from verdicts where verdict = 'not_relevant'),
useful    as (select v.document_id, c.embedding from verdicts v
              join document_chunk c on c.document_id = v.document_id
              where v.verdict = 'useful'),
neighbours as (select n.document_id, u.document_id as via,
                      1 - (n.embedding::vector <=> u.embedding::vector) as near
               from useful u cross join lateral (
                 select c.document_id, c.embedding from document_chunk c
                 where c.document_id <> u.document_id
                 order by c.embedding <=> u.embedding limit 10) n
               where near >= 0.85)
```

`candidates` becomes the union of the HNSW candidates and `neighbours`,
minus `excluded`. The ordering key is `best_cos + case when via is not null
then 0.05 else 0 end`; `score` on the hit stays the plain best cosine, the
same rule `lodestone-hit-sentences` follows for thin documents: `score` is
always the cosine, and anything that moves a hit moves only its place.
`scorePaper` gets the same logic as pure functions so the reference and the
SQL can be tested against each other as they are today.

### 3. Snapshots are written when a search completes

`card_rank(idea_id, import_seq, taken_at, hits jsonb, primary key (idea_id,
import_seq))`: the ten ids, scores and first block keys. `importCard` bumps
`forge_card.import_seq`. `searchCard` writes the row when the card's search
reaches `done`, ranking as the owner; the `GET` route writes it only if no
`card_search` row exists for the card (a card imported before search
existed). The first `GET` after an import never snapshots, so a diff is
never taken against a pre-search list. One row per import, a few hundred
bytes each.

### 4. The diff names blocks from `card_search`, not from the ranking

`changes.blocks` is the set of block keys whose `card_search.text_hash`
changed on the last import. `added` and `dropped` are set differences on
document id between the current ranking and the newest `card_rank` row with
a lower `import_seq`. A dropped hit with a `useful` verdict is listed under
`dropped` with `verdict: "useful"`; it is not re-added. With no previous
snapshot, or while `search.state` is `running`, `changes` is null.

### 5. The graph is one table with a vector column, written from day one

```
paper_block_verdict(id, document_id uuid, block text, idea_id, person_id,
                    verdict, block_embedding halfvec(1024) not null, at,
                    unique (document_id, block, idea_id, person_id))
```

`recordFeedback` for `kind = 'paper'` reads `context.blockKeys[0]` (the
client sends keys from `lodestone-card-search` on; a context with only
labels is mapped through the label→key table and a context with neither
writes no row), computes `blockVector(rows, blockKey)` — a new function in
`vectors.ts`: the unit mean of that block's rows, null only when the block
has no embedded rows, in which case no row is written — and upserts. The
vector is a snapshot on purpose: it is what the idea looked like when the
person judged the paper, and it stays meaningful after the card pivots.

### 6. The prior is after the MVP

The closeness-weighted, signed prior described in the proposal (`sign ·
max(0, cos − CLOSE)`, scaled by `PRIOR_WEIGHT`, on when `PRIOR_MIN_CARDS`
ideas have rows, active members only by a read-time join) is the design for
the table's first reader. It is not built in this change: the MVP cohort
will not reach a hundred cards, and a CTE that is off has no gate to pass.
This change builds the table, the write, and the map's count. The prior gets
its own change when the count is within reach; `docs/next-steps.md` "After
the MVP" names it.

### 7. Constants and the eval

`NEAR_USEFUL` 0.85 and `USEFUL_BOOST` 0.05 in `priorArt.ts` beside
`PAPER_FLOOR`, provisional. The eval runner gains `--verdicts`: mark the
top-five relevant hits of ten cards `useful` and two unmarked hits
`not_relevant`, then re-rank with `--no-search` so the corpus is the
committed one. Acceptance is that excluded hits are gone, MRR of marked
documents on those ten does not fall, and the neighbour rows that appear are
in the marked set at a higher rate than the candidates they displaced.
