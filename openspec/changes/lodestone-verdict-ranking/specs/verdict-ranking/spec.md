## ADDED Requirements

### Requirement: An owner's verdicts shape their own list and no one else's

When ranking prior art for a viewer who is the card's owner, the system SHALL
exclude every document the owner marked `not_relevant` for that card, and
SHALL add to the candidates the ten nearest corpus documents to each document
the owner marked `useful`. A candidate within `NEAR_USEFUL` (0.85) cosine of
a useful document SHALL be ordered as if its score were `USEFUL_BOOST` (0.05)
higher and SHALL carry `via: { useful: <documentId> }`. The hit's `score`
SHALL remain its best-block cosine. `known` SHALL change nothing. For any
viewer who is not the owner the ranking SHALL carry no exclusion, no
neighbour, no `via` and no `changes`. No verdict SHALL be sent to any
external service.

#### Scenario: Not relevant disappears
- **WHEN** the owner marks a top-ten hit `not_relevant` and reads the card
- **THEN** that document is absent and the list still holds ten hits when the
  corpus allows

#### Scenario: A neighbour of a useful hit appears
- **WHEN** the owner marks a hit `useful` and a corpus document within 0.85
  of it would otherwise rank eleventh
- **THEN** it appears in the top ten with `via.useful` naming the marked
  document and a `score` equal to its own best-block cosine

#### Scenario: A cohort viewer sees the plain ranking
- **WHEN** another active member opens the owner's published card on the web
  page or reads it by token
- **THEN** the response carries no `via`, no `changes`, and includes the
  document the owner excluded

#### Scenario: A peer verdict does not break the join
- **WHEN** the owner has a `peer` verdict whose target is a 32-hex idea id
- **THEN** the ranking statement runs without a cast error
