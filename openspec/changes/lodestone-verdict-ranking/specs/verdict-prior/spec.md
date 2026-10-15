## ADDED Requirements

### Requirement: Every verdict is recorded against the block it judged

When a paper verdict is recorded, the system SHALL write one row to
`paper_block_verdict` carrying the document, the block key named first in the
verdict's context, the idea, the person, the verdict, and the unit-mean
vector of that block's embedded rows as they stood at that moment. A second
verdict by the same person on the same document, block and idea SHALL
replace the first. A context naming no block, or a block with no embedded
rows, SHALL write no row and SHALL NOT fail the verdict.

#### Scenario: A verdict writes its row
- **WHEN** an owner posts `useful` on a hit whose context names
  `value_proposition`
- **THEN** one `paper_block_verdict` row exists with that block key, the
  document, and a non-null `block_embedding`

#### Scenario: A label is mapped
- **WHEN** a client still sends `context.blocks: ["Value proposition"]` and
  no `blockKeys`
- **THEN** the row's block is `value_proposition`

#### Scenario: Nothing to anchor
- **WHEN** a verdict's context names no block
- **THEN** the verdict is stored in `card_feedback` and no graph row is written

### Requirement: The table is read by no ranking in this change

The system SHALL NOT apply `paper_block_verdict` to any ranking until a later
change builds the prior. The cohort map SHALL show operators how many distinct
ideas have rows and that the prior is off.

#### Scenario: Rows do not move rankings
- **WHEN** the table holds rows from many ideas
- **THEN** every ranking is identical with the table full or empty

#### Scenario: A revoked member's rows are still excluded at read time
- **WHEN** a later change reads the table
- **THEN** it SHALL join active membership and count no row of a revoked
  member, with no row deleted
