## ADDED Requirements

### Requirement: The top ten holds at most three hits per field

When ranking prior art for a card, the system SHALL consider at least three
times as many candidates as it returns and fill the result in score order
taking a hit only while fewer than three hits of its `field` have been taken.
A patent's field is its CPC section; a null field is its own bucket. The
score of each returned hit is unchanged; only its presence in the list is
affected.

#### Scenario: A dominant field is capped
- **WHEN** the twelve closest documents are all in `Computer Science` and the
  thirteenth is in `Economics`
- **THEN** the top ten holds three from `Computer Science`, the `Economics`
  document, and the next-best documents from other fields

#### Scenario: Fewer fields than slots
- **WHEN** the candidates near a card hold only two fields
- **THEN** the list holds up to six hits and is shorter than ten rather than
  padded

#### Scenario: Reference and SQL agree
- **WHEN** `scorePaper` over every row and `priorArtFor` rank the same card
- **THEN** both return the same ids in the same order after the quota

### Requirement: A hit carries block keys

Each prior-art hit SHALL carry `blockKeys`, the keys of the blocks named in
`blocks`, in the same order.

#### Scenario: Keys beside labels
- **WHEN** a hit's `blocks` is `["Value proposition", "Channels"]`
- **THEN** its `blockKeys` is `["value_proposition", "channels"]`
