## ADDED Requirements

### Requirement: A hit says what kind it is and where it came from

Every prior-art hit returned by the card API SHALL carry `kind` (`paper` or
`patent`) and `querySet` (the ingest set it came from, or null for a seeded
abstract). Patents SHALL rank in the same list as papers by the same cosine.

#### Scenario: A patent ranks beside a paper
- **WHEN** a card's value proposition is closest to a patent abstract
- **THEN** `priorArt[0].kind` is `patent` and the hit carries the patent's
  url and year like any paper

### Requirement: A token can read one abstract

The system SHALL serve `GET /api/lodestone/papers/<documentId>` to any valid
bearer token, returning the document's kind, title, canonical abstract,
provenance and a citation line. It SHALL answer 404 for an id that is not a
paper or patent document and 401 without a token. It SHALL never return full
text, because none is stored.

#### Scenario: Whetstone reads a hit
- **WHEN** a client with a valid token requests a `documentId` from its
  card's `priorArt`
- **THEN** it receives the abstract and a citation line such as
  "Author, Author (2021). Title. Venue."

#### Scenario: A card id is not a paper
- **WHEN** the request names a `forge_card` idea id
- **THEN** the answer is 404
