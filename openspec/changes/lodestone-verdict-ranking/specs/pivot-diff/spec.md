## ADDED Requirements

### Requirement: A card read reports what changed since the last import

The system SHALL snapshot a card's ranked hits once per import, and `GET
/api/lodestone/cards/<ideaId>` for the owner SHALL carry `changes`: `{ since,
blocks, added, dropped }` where `since` is the time of the previous snapshot,
`blocks` the keys whose entry text changed on the latest import, `added` the
hits present now and absent then, and `dropped` the hits present then and
absent now, each dropped hit carrying the owner's verdict if any. With no
previous snapshot `changes` SHALL be null.

#### Scenario: A segment pivot
- **WHEN** the owner re-sends a card with `customer_segments` rewritten and
  reads it
- **THEN** `changes.blocks` is `["customer_segments"]`, `added` lists the
  hits that were not in the previous top ten, and `dropped` lists the ones
  that left

#### Scenario: A useful hit fell out
- **WHEN** a dropped hit had verdict `useful`
- **THEN** it appears in `dropped` with `verdict: "useful"` and is not
  re-added to the list

#### Scenario: First read
- **WHEN** a card is read after its first import
- **THEN** `changes` is null and a snapshot is written

#### Scenario: Reads do not multiply snapshots
- **WHEN** the card is read three times with no import between
- **THEN** one snapshot exists for that import
