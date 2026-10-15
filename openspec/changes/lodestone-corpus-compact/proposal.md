## Why

The corpus now grows by query (`lodestone-corpus-ingest`), and the way
Lodestone stores and reads it was sized for fifteen seeded abstracts.

- **Every read loads the whole corpus into Node.** `priorArtFor` selects every
  paper and patent vector and scores them in application code. At 100k
  documents that is about 400 MB moved per card view. `corpusSize` does the
  same just to count rows, and it runs on the cards list, every card page and
  `/api/lodestone/me`. The map calls `priorArtFor` once per published card.
- **Each abstract is stored three times**: `document.text`,
  `artifact_texts.canonical_text` and `document_chunk.text`.
- **Vectors are full precision.** A `vector(1024)` is 4 KB per document, more
  than the abstract it came from.

A design review (2026-10-15) asked whether Lodestone should store abstracts at
all, or keep metadata and a vector and fetch the text from OpenAlex on demand.
It should keep them. The text is the smaller part of a row, and it is the only
copy that cannot drift. Whetstone's `support` rows must be substrings of the
abstract the run read, and OpenAlex edits its abstracts. Re-embedding when
`voyage-3.5` is retired needs the text. Publishers (Elsevier, Springer Nature)
have had closed-access abstracts withdrawn from OpenAlex. Patents have no
second source while PatentsView is paused. The waste is in the copies and the
read path, not in keeping the text.

## What Changes

- **One copy of each abstract.** The abstract lives in
  `artifact_texts.canonical_text` only. `document.text` and
  `document_chunk.text` become nullable and are null for papers and patents.
  Decks and résumés are unchanged. `embedPaperAbstracts` reads the canonical
  text.
- **Half-precision vectors with an index.** `document_chunk.embedding`
  becomes `halfvec(1024)`, cast in place with no re-embedding, and gets an
  HNSW `halfvec_cosine_ops` index. Card and assertion vectors stay
  `vector(1024)`.
- **Ranking in SQL.** `priorArtFor` finds candidates by index, the top k per
  card block, and scores them exactly in the database. Only the k hits and
  their per-block cosines come back to Node. The result is the same list: same
  score (best block), same `blocks` explanation, same `yours` flag.
  `since` (the digest) scores only the documents added after that date, also
  in SQL.
- **Counting is a count.** `corpusSize` becomes `count(*)` over corpus
  documents that have a vector.
- **`abstractHash` on the read endpoint.** `GET /api/lodestone/papers/<id>`
  adds the stored `text_hash`. Whetstone can keep it on a `support` row and
  tell when an abstract it weighed was later replaced.

## Capabilities

### New Capabilities
- `corpus-store`: one stored copy of each abstract, half-precision indexed
  vectors, ranking and counting in the database.

### Modified Capabilities
- `paper-read` (from `lodestone-corpus-ingest`): the response gains
  `abstractHash`.

## Non-goals

- **No text-free corpus and no lazy fetch.** The design review weighed it and
  rejected it for the reasons above. If a publisher ever objects, a later
  change can null their stored text and have the read endpoint fetch it live.
  Nothing here builds that.
- **No ranking by OpenAlex semantic search.** It would send card text off the
  server, void the `CLOSE`/`PAPER_FLOOR` calibration (it uses a different
  model), run at 1 request per second, and has no patents. Using it to *find
  papers to ingest* from published cards is a separate proposal.
- **No re-embed and no change of model or dimensions.** The move off
  `voyage-3.5` is its own change, and it will read the stored text.
- **No change to card, assertion or thesis-card vectors.**

## Impact

- Changed: `src/db/schema.ts` (`document.text` and `document_chunk.text`
  nullable, `document_chunk.embedding` halfvec, HNSW index), one migration
  `0014_corpus_compact`, `src/lodestone/priorArt.ts` (SQL ranking, count,
  `abstractHash`), `src/harness/papers/ingest.ts` and `patentsview.ts`
  (`document.text` null), `scripts/lodestone/seed.mts`, `docs/api.md`.
- Tests that assert `document.text` equals the abstract change to read
  `artifact_texts`: `ingest.test.ts`, `patentsview.test.ts`,
  `network.test.ts`. `routes.test.ts` gains `abstractHash`.
- Whetstone: additive only. It may store `abstractHash` on `support` rows.
  Nothing breaks if it doesn't.
- Size per corpus document falls from about 9.3 KB to about 7 KB with the
  index. A card view's read falls from O(corpus) to O(k × blocks).
- No new dependencies. pgvector 0.8.1 (PGlite) and Postgres pgvector ≥ 0.7
  both have `halfvec` and HNSW, and drizzle 0.45 has a `halfvec` column.
