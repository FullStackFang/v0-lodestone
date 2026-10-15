## ADDED Requirements

### Requirement: A hit names the abstract sentences nearest its block

Each prior-art hit SHALL carry `sentences`: up to three sentences of the
document's abstract with the highest cosine to any entry vector of the hit's
first block, returned in abstract order as `{ text, block, cosine }` where
`block` is the block key, and `abstractHash`, the hash of the abstract the
sentences were cut from. The sentences SHALL be substrings of the abstract
the read endpoint returns under that hash. Selection SHALL use stored
sentence vectors and no model call.

#### Scenario: Three sentences come back
- **WHEN** a hit's abstract has eight sentences and its first block key is
  `value_proposition`
- **THEN** `sentences` holds three entries, each a substring of the abstract,
  each with `block: "value_proposition"`, ordered by position in the
  abstract, and `abstractHash` equals the read endpoint's

#### Scenario: A short abstract
- **WHEN** the abstract splits into two sentences
- **THEN** `sentences` holds two

#### Scenario: Sentence vectors are kept
- **WHEN** the same card is read twice
- **THEN** the second read embeds nothing and returns the same sentences

#### Scenario: A replaced abstract is re-cut
- **WHEN** a document's abstract is replaced by a new version
- **THEN** the next read returns sentences cut from the new text and a new
  `abstractHash`

### Requirement: Documents without an abstract are kept as thin

The system SHALL ingest a work that card search returns with no abstract but
a title and a Semantic Scholar TLDR, using the TLDR as its text,
`source_format = "tldr"`, `provenance.thin = true`, exempt from the
thirty-word floor. A thin hit SHALL carry `thin: true`, `sentences` equal to
the TLDR as one entry, and a `score` equal to its best-block cosine, and
SHALL be ordered as if its score were multiplied by `THIN_FACTOR` (0.9)
before the candidate cut and the field quota. The operator ingest command
SHALL continue to refuse works without an abstract.

#### Scenario: A thin hit is marked
- **WHEN** a thin document is among a card's top ten
- **THEN** the hit carries `thin: true`, one sentence, and a `score` equal
  to its cosine

#### Scenario: A thin document is ordered below a full one
- **WHEN** a thin document at cosine 0.80 and a full document at 0.76 are
  both candidates
- **THEN** the full document is listed first

#### Scenario: The operator path still refuses
- **WHEN** `lodestone:ingest --query` meets a work with no abstract
- **THEN** it reports `no_abstract` and writes nothing

#### Scenario: An abstract arrives later
- **WHEN** card search returns a work stored as thin and OpenAlex now has
  its abstract
- **THEN** the ingest with `replaceThin` fetches it, writes the abstract as a
  new version, clears `thin`, and the read endpoint returns a new
  `abstractHash`
