## ADDED Requirements

### Requirement: An abstract is stored once

The system SHALL hold a paper's or patent's abstract in one place, the newest
`artifact_texts.canonical_text` for its document. `document.text` and
`document_chunk.text` SHALL be null for documents with `source` in `paper`,
`patent`. Embedding and the read endpoint SHALL read the canonical text.

#### Scenario: An ingested work
- **WHEN** a work is ingested and embedded
- **THEN** its abstract appears in `artifact_texts.canonical_text`, and its
  `document.text` and `document_chunk.text` are null

#### Scenario: Existing rows are compacted
- **WHEN** migration `0014` runs on a database with corpus documents that have
  an `artifact_texts` row
- **THEN** their `document.text` and `document_chunk.text` are null, and
  `GET /api/lodestone/papers/<id>` returns the same abstract as before

### Requirement: Corpus vectors are half precision and indexed

The system SHALL store corpus vectors as `halfvec(1024)` with an HNSW cosine
index, converted from the existing vectors without calling the embedding
provider.

#### Scenario: Migration without re-embedding
- **WHEN** migration `0014` runs on a database whose corpus is already embedded
- **THEN** every corpus document still has a vector, and no embedding request
  is made

### Requirement: Prior art is ranked in the database

The system SHALL rank a card's prior art without loading the corpus's vectors
into the application. Only candidate documents and their per-block cosines
SHALL be returned. The result SHALL be the same ordered list, with the same
scores, blocks and `yours` flags, as an exact scan of every corpus vector,
within half-precision rounding.

#### Scenario: Same answer as the exact scan
- **WHEN** `priorArtFor(card, 10)` runs for each seeded card
- **THEN** its ids match the exact full scan's top 10, and every score is
  within 0.002 of it

#### Scenario: The digest window
- **WHEN** `priorArtFor(card, 5, since)` runs
- **THEN** only documents added after `since` are scored, and the result is
  ranked as above

### Requirement: Counting the corpus reads no vectors

`corpusSize` SHALL return the number of corpus documents with a vector using
a count query.

#### Scenario: A count
- **WHEN** the corpus holds 477 embedded papers and 3 without a vector
- **THEN** `corpusSize` returns 477
