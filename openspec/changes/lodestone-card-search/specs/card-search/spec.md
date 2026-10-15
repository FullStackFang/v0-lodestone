## ADDED Requirements

### Requirement: A card is searched for on import

After a card is filed and embedded, the system SHALL search, in the
background, for each block that has entries: OpenAlex semantic search,
OpenAlex keyword search and Semantic Scholar search. Hits SHALL be resolved
to OpenAlex works by DOI or OpenAlex id, deduplicated against the corpus, and
new ones ingested with `query_set = "card-search"` and embedded. A Semantic
Scholar hit with no DOI SHALL be skipped and counted. Rate limits of each
source SHALL be respected: OpenAlex semantic 1/s, Semantic Scholar 1/s,
keyed OpenAlex 25/s. The route and the import action SHALL declare
`maxDuration = 300`.

#### Scenario: A first import searches every block
- **WHEN** a card with seven non-empty blocks is sent for the first time
- **THEN** seven `card_search` rows exist, each source is called once per
  block, and every new hit is a corpus document with
  `provenance.query_set = "card-search"`

#### Scenario: A known paper is not written twice
- **WHEN** a search returns a work whose DOI is already in the corpus
- **THEN** no new document is written and the source count reports it as
  existing

#### Scenario: The response does not wait
- **WHEN** the card is sent
- **THEN** `POST` answers within the time it takes to file and embed, with
  `search: "queued"`, and a later `GET` shows `search.state` as `running`
  then `done`

### Requirement: Only changed or stale blocks search again

The system SHALL keep, per card and block key, a hash of the block's entry
texts. On re-import it SHALL search only blocks whose hash differs from the
stored one or whose row has been `running` for more than five minutes, and
SHALL remove the row of a block that no longer has entries. A card with no
rows SHALL report `search.state = "done"` and `found = 0`.

#### Scenario: One block changed
- **WHEN** a card is re-sent with only `customer_segments` edited
- **THEN** exactly one block is searched and the other rows keep their
  `finished_at`

#### Scenario: Nothing changed
- **WHEN** a card is re-sent unchanged
- **THEN** no source is called and `search.state` is `done`

#### Scenario: A stale row is retried
- **WHEN** a block's row has been `running` for six minutes and the card is
  re-sent unchanged
- **THEN** that block is searched again

### Requirement: Abstracted queries when the document carries a purpose

The system SHALL accept `purpose: { l1, l2 }` on a `forge-idea/5` document,
ignoring other keys under it, and when present SHALL begin the semantic
query for every block with `l2`. When absent the block text alone is the
query and the card reports `search.abstracted: false`. `purpose` SHALL NOT
be projected, embedded, or returned to any member but the owner.

#### Scenario: Purpose leads the query
- **WHEN** a `/5` document with `purpose.l2 = "Reducing spoilage of
  perishable goods in short supply chains"` is sent
- **THEN** each semantic query string begins with that sentence

#### Scenario: A `/4` document still works
- **WHEN** a `/4` document is sent
- **THEN** it is searched with block text and `search.abstracted` is false

#### Scenario: Another member cannot see the purpose
- **WHEN** another active member reads the owner's published card
- **THEN** the response carries no `purpose`

### Requirement: Provenance names nothing of the card

A searched-in document's provenance SHALL carry only keys from `{ doi,
openalex_id, field, venue, year, authors, url, query_set, thin, tldr }`,
with `query_set = "card-search"`, and SHALL NOT carry the query text, the
purpose, an idea id or any block text. The card a search served SHALL be
recorded only in `card_search`.

#### Scenario: Another member reads a paper
- **WHEN** any token reads `GET /api/lodestone/papers/<id>` for a
  searched-in document
- **THEN** the provenance keys are within the allowlist and `query_set` is
  `"card-search"`

### Requirement: Searched-in documents stay out of the weekly digest

The digest's window of documents added since the last digest SHALL exclude
documents whose `query_set` is `card-search`.

#### Scenario: A private card's topic does not reach the cohort
- **WHEN** a member sends a private card and search ingests twenty papers
- **THEN** no other member's digest that week ranks those twenty

### Requirement: The policy on card text is written down

`docs/api.md` SHALL state that block entries and the purpose are sent as
search queries to OpenAlex and Semantic Scholar, and that nothing else about
a card leaves the server.

#### Scenario: A client reads the contract
- **WHEN** `docs/api.md` is read
- **THEN** it names the two services and what they receive
