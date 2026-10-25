# research-search Specification

## Purpose
TBD - created by archiving change lodestone-research-review. Update Purpose after archive.
## Requirements
### Requirement: Search returns the nearest stored papers
`lodestone:search --q "<text>" [--k <n>] [--set <name>]` SHALL embed the text with Voyage's
`query` input type and return the `k` nearest paper documents (default 30) by cosine over
`document_chunk`. With `--set`, it SHALL return only documents whose `provenance.query_set`
equals the name.

#### Scenario: A question against the NeurIPS set
- **WHEN** `--q "LLM recommendations popularity bias" --set neurips-2021-2026 --k 10` runs on
  a loaded corpus
- **THEN** it returns 10 hits from that set, ordered by descending similarity

#### Scenario: No key
- **WHEN** `VOYAGE_API_KEY` is unset
- **THEN** the command exits non-zero and returns no hits

### Requirement: Each hit carries what a review needs
Each hit SHALL carry:
- the document id
- title, year and the query set
- rating_avg and citations_per_year
- a link: OpenReview, else site, else DOI
- the similarity
- the abstract

A metric absent from provenance SHALL print as `unknown`, never as 0.

#### Scenario: A 2026 hit
- **WHEN** a hit has no rating or citations
- **THEN** its rating and citations print `unknown`

### Requirement: OpenAlex hits are optional and not stored
With `--openalex`, the command SHALL add up to `k` live OpenAlex works for the same text
through the existing `searchWorks`. Each carries its OpenAlex W-id and `source: "openalex"`.
These hits SHALL NOT be written to the database by the search.

#### Scenario: Live hits stay out of the store
- **WHEN** `--openalex` returns a work that is not stored
- **THEN** the hit lists its W-id and the document count is unchanged

### Requirement: JSON output
With `--json <file>`, the command SHALL write the hits as a JSON array to the file, in the
same fields as the printed output, with absent metrics as `null`.

#### Scenario: Writing hits for the skill
- **WHEN** `--json research/x/search.json` runs
- **THEN** the file holds one object per hit with `id`, `source`, `title`, `year`,
  `rating_avg`, `citations_per_year`, `link`, `similarity` and `abstract`

