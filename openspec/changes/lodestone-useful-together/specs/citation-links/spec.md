## ADDED Requirements

### Requirement: A paper's references are stored when it is ingested

The system SHALL, when a paper is ingested from an OpenAlex work that
carries `referenced_works`, write one `document_references` row holding the paper's own W number and the W numbers it cites, in the same
transaction as the document. A work listing no references SHALL be stored
with an empty list. The references SHALL NOT be written into `provenance`,
and `GET /api/lodestone/papers/<id>` SHALL be unchanged.

#### Scenario: A fetched work keeps its references
- **WHEN** `ingestWork` writes a work whose `referenced_works` lists 40 ids
- **THEN** one row exists for the document with 40 cited W numbers, and its
  provenance keys stay within `PROVENANCE_KEYS`

#### Scenario: A held paper is backfilled
- **WHEN** the backfill runs over papers with an OpenAlex id and no row
- **THEN** it asks OpenAlex for at most 100 ids per request with
  `select=id,referenced_works`, writes a row per returned work, and lists the
  ids it did not get back

### Requirement: The known link is read from references

The system SHALL treat papers A and B as known together when A cites B, B
cites A, or the Jaccard overlap of their cited lists is at least
`KNOWN_COUPLING`. When either paper has no row, or both lists are empty, the
link SHALL be unknown, and an unknown link SHALL NOT count as weak.

#### Scenario: Direct citation
- **WHEN** A's cited list holds B's W number
- **THEN** A and B are known together

#### Scenario: Coupled by shared references
- **WHEN** A and B share references with Jaccard 0.2 and neither cites the
  other
- **THEN** they are known together

#### Scenario: No evidence
- **WHEN** B is a patent or has no references row
- **THEN** the link is unknown
