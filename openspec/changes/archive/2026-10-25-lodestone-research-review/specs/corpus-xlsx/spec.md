## ADDED Requirements

### Requirement: The spreadsheet loads as a paper source
`lodestone:ingest --source xlsx --file <path> --set <name>` SHALL read the `Corpus` sheet and
write each row as one `document` (source `paper`) with one `artifact_texts` row. The canonical
text SHALL be the abstract, or the tldr when the abstract is empty. Provenance SHALL hold:
- `neurips_id` from the `id` column
- `openreview_id`, only when the `openreview` column is non-empty
- `query_set = <name>`
- year, title, authors, first_author, track, status, primary_area, topics, mechanisms,
  rating_avg, citations, citations_per_year, citation_percentile_in_year, pdf, site, github
  and openreview

#### Scenario: A 2023 row with metrics
- **WHEN** a row with year 2023, an abstract, an OpenReview link, rating_avg 6.25 and
  citations_per_year 12.4 is loaded
- **THEN** one paper document exists whose canonical text is the abstract and whose provenance
  holds `neurips_id`, `openreview_id`, `rating_avg = 6.25` and `citations_per_year = 12.4`

#### Scenario: A 2026 row without metrics
- **WHEN** a row has no OpenReview link, rating or citations
- **THEN** the document is stored with `neurips_id` and without `openreview_id`, and its
  missing metrics are absent from provenance rather than 0

#### Scenario: A row with no text
- **WHEN** a row has neither abstract nor tldr
- **THEN** the run reports it as `no_text` and writes no document

### Requirement: Loading is idempotent on neurips_id
A unique partial index on `artifact_texts (provenance->>'neurips_id')` SHALL exist. A row whose
`neurips_id` is already held SHALL be reported `existing` and write nothing.

#### Scenario: Re-running the load
- **WHEN** the same file is loaded twice
- **THEN** the second run reports every stored row as `existing` and the document count is
  unchanged

#### Scenario: A duplicated id inside the file
- **WHEN** two rows share one `id`
- **THEN** the first is stored and the second is reported `existing`

### Requirement: The load ends embedded
The run SHALL end with `embedPaperAbstracts`, so every stored row with text gets a vector. A
run stopped mid-embed SHALL be finished by the next run. The run SHALL refuse to start without
`VOYAGE_API_KEY`.

#### Scenario: No key
- **WHEN** `VOYAGE_API_KEY` is unset
- **THEN** the command exits non-zero before reading the file and says the key is required

#### Scenario: Summary line
- **WHEN** the run finishes
- **THEN** it prints counts for new, existing, no_text, embedded and without a vector
