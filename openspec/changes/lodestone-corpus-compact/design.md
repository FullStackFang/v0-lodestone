## Context

`lodestone-corpus-ingest` made the corpus grow by query: 477 works for one
query in the 7.1 check, about a thousand across the first query sets. The
storage and read path it inherited were written for the fifteen seeded
abstracts:

- `papers()` in `src/lodestone/priorArt.ts` selects every corpus vector, and
  `scorePaper` takes the best cosine against the card's block vectors in
  Node.
- `corpusSize` calls `papers()` and takes `.length`.
- `cohortMap` calls `priorArtFor` for every published card.
- The ingest writes the abstract to `document.text`, `putArtifactText` writes
  it to `artifact_texts.canonical_text`, and `embedPaperAbstracts` copies it
  into `document_chunk.text`.

A Fable design review (2026-10-15) checked whether the text should be stored
at all. Its findings are summarized in the proposal. This document covers how
to store it once and read the corpus without moving it.

## Decisions

### 1. The abstract's one home is `artifact_texts.canonical_text`

That row already carries the text hash, version and provenance. Every corpus
writer (`ingestWork`, `ingestPatent`, the seed script) already writes it. The
read endpoint already prefers it. `document.text` was the deck/résumé column
and only held abstracts by accident of the first seed.

- `document.text` and `document_chunk.text` drop `NOT NULL`. Corpus writers
  pass `null`.
- `embedPaperAbstracts` joins the newest `artifact_texts` version and embeds
  `canonical_text`.
- `corpusDocument` reads `canonical_text` only. A corpus document without an
  `artifact_texts` row is a write that broke halfway, and it answers 404.
- The migration nulls `document.text` and `document_chunk.text` for
  `source in ('paper','patent')`, but only where an `artifact_texts` row
  exists. Any orphan keeps its text and is reported by the verification task.

*Alternative:* keep `document.text` as the home and drop `canonical_text`.
Rejected: the text hash, the versioning and the dedupe all live on
`artifact_texts`.

### 2. `halfvec(1024)`, cast in place

`ALTER TABLE document_chunk ALTER COLUMN embedding TYPE halfvec(1024) USING
embedding::halfvec(1024)`. This halves the vector and needs no Voyage call.
Half precision rounds each component to about 3 significant digits. The
cosine moves by about 1e-3, well inside the 0.03 band `scorePaper` uses to
name blocks and far from the 0.75 floor. Task 4.2 measures this on the real
corpus rather than trusting the estimate.

Card vectors (`assertions`, `thesis_card`) stay `vector(1024)`. Queries cast
the card side: `embedding <=> $1::halfvec`.

Dimensions stay 1024. Matryoshka truncation to 512 would halve storage again,
but it changes scores and needs a re-embed and a recalibration. Both belong to
the move off `voyage-3.5`.

### 3. HNSW index, then an exact score

Index: `document_chunk_embedding_hnsw` using `hnsw (embedding
halfvec_cosine_ops)`, named like the `assertions_*_hnsw` indexes.

`priorArtFor(db, ideaId, k)` runs in two steps:

1. **Candidates.** For each block vector b, select the k nearest corpus chunks
   by `embedding <=> b` (HNSW). Take the union. With nine blocks that is at
   most 9k ids.
2. **Score.** For the candidates only, return
   `(document_id, block, 1 - (embedding <=> b))` for every block. That is
   9 × 9k rows at most, with metadata joined. `scorePaper`'s logic (best
   block, blocks within 0.03, `yours`) runs on that, then sort and take k.

**Why the union is exact.** A paper's score is its best cosine over the
blocks. Suppose P is in the true top k with best block b and score s. Every
paper ranked above P in block b's list has a cosine above s against b, so its
own score is above s too. Fewer than k papers score above P, so P is in block
b's top k.

The only loss is HNSW's approximation. At k ≤ 10 with the default
`ef_search = 40`, recall at these sizes is about 1. Task 4.2 checks the top 10
against the exact scan for every seeded card.

**`since`** (the digest) skips the index. It scores in SQL the documents added
after `since`, using a lateral join over the block vectors, `max` per
document, ordered, `limit k`. That is a week of ingest, not the corpus, and it
avoids pgvector's filtered-HNSW recall problem without needing iterative
scans.

### 4. Ranking returns the same shape

`PaperHit` is unchanged. `scorePaper(rows, paper, held)` stays exported for
its tests. The SQL path builds the same per-block map from the rows that come
back. `cosine` and `ideaVectors` are untouched.

### 5. `corpusSize` is a count

`select count(distinct document_id) from document_chunk join document … where
source in (corpus) and embedding is not null`. Same number as today's
`papers().length`.

### 6. `abstractHash` is the stored `text_hash`

There is nothing new to compute. `CorpusDocument` gains `abstractHash`, and
`docs/api.md` says what a client may do with it: keep it beside anything
anchored in the abstract, and compare it on a later read.

## Risks / Trade-offs

- **The migration rewrites `document_chunk`**, both the type cast and the
  index build. At about a thousand rows that is instant. At 1M it is minutes
  under an exclusive lock. Today is the cheapest time to do it.
- **HNSW build memory** with a 1M corpus on a small Postgres. Not a concern
  until the corpus is that size. `maintenance_work_mem` is the knob.
- **Seeded abstracts in old dev databases** may lack `artifact_texts` if they
  predate `putArtifactText` in the seed. The migration leaves those rows
  alone, and task 2.3 counts them.
- **`document.text` nullable** affects every reader of decks and résumés.
  Writers of those sources still always set it, and a check constraint keeps
  it required for `source in ('deck','resume')`.

## Measured (2026-10-15)

A copy of the dev database (968 papers, 24 seeded cards), at `0013` and then
migrated to `0014`, each after `vacuum full`. `pg_total_relation_size` ÷ 968,
in bytes; `document_chunk` includes the HNSW index.

| Table            | Before | After |
| ---------------- | -----: | ----: |
| `document`       |  1,676 |   228 |
| `document_chunk` |  7,202 | 5,746 |
| `artifact_texts` |  2,370 | 2,370 |
| Per document     | 11,247 | 8,344 |

The proposal's estimate was 9.3 KB to 7 KB; the ratio held. Ranking against
the exact scan from the pre-`0014` code: 48 lists (each card's top 10 and a
since-window top 5), no difference in ids, order, blocks or `yours`, worst
score difference 2.2e-5.
