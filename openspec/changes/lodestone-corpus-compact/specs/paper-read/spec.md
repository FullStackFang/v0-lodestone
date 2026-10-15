## ADDED Requirements

### Requirement: The read endpoint names the abstract's hash

`GET /api/lodestone/papers/<documentId>` SHALL return `abstractHash`, the
stored `text_hash` of the abstract it serves, so a client can tell when an
abstract it anchored a sentence in has since been replaced.

#### Scenario: Same abstract, same hash
- **WHEN** a client reads the same paper twice with no re-ingest between
- **THEN** both responses carry the same `abstractHash`, equal to the
  `text_hash` of the stored canonical text
