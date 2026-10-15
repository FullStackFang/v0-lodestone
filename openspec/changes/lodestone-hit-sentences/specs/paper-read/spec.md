## MODIFIED Requirements

### Requirement: One corpus document is readable whole

`GET /api/lodestone/papers/<documentId>` SHALL return, to any valid token,
the document's `kind`, `title`, `abstract`, `abstractHash`, `provenance` and
`citation`, and additionally `thin` (boolean) and `abstractKind`, which is
`"abstract"` for a full abstract and `"tldr"` for a thin document whose text
is a Semantic Scholar TLDR.

#### Scenario: A full document
- **WHEN** a document with an abstract is read
- **THEN** `thin` is false and `abstractKind` is `"abstract"`

#### Scenario: A thin document
- **WHEN** a thin document is read
- **THEN** `thin` is true, `abstractKind` is `"tldr"`, and `abstract` is the
  TLDR text whose hash is `abstractHash`
