## MODIFIED Requirements

### Requirement: A query ingests papers from OpenAlex

The system SHALL provide a command that, given a search string and an optional
earliest publication year, pages the OpenAlex works endpoint by cursor, filtered
to works with an abstract, and writes each work as one `document` with `source =
"paper"` and one `artifact_texts` row carrying DOI, OpenAlex id, venue, year,
authors, url, field, and the query set it came from. Every request to OpenAlex,
by query or by single work id, SHALL carry `api_key` when `OPENALEX_API_KEY` is
set and `mailto` when `OPENALEX_MAILTO` is set. With a key the command SHALL
NOT exceed 25 requests a second; without one it SHALL NOT exceed 10 and SHALL
print once that it is running on the shared keyless budget.

#### Scenario: Two pages are ingested
- **WHEN** the command runs with `--query "food waste logistics" --limit 300`
  and OpenAlex returns 200 then 100 works
- **THEN** 300 documents exist with `source = "paper"`, each with provenance
  carrying its OpenAlex id and `query_set`

#### Scenario: The key rides on a single-work lookup
- **WHEN** `OPENALEX_API_KEY` is set and `--list` ingests a DOI
- **THEN** the request URL carries `api_key` and the run spaces requests at
  25 a second

#### Scenario: No key is visible
- **WHEN** `OPENALEX_API_KEY` is unset
- **THEN** the command prints one line naming the shared $0.10 budget and
  spaces requests at 10 a second

#### Scenario: A rate limit stops the run cleanly
- **WHEN** OpenAlex answers 429 on the third page
- **THEN** the rows from the first two pages are kept, the cursor is printed,
  and the process exits 2 without a stack trace

### Requirement: Patents are a second source of the same shape

The system SHALL ingest granted US patents from Google Patents Public Datasets
on BigQuery (`patents-public-data.patents.publications`) as `document` rows
with `source = "patent"`, the English abstract as text, and provenance
carrying the patent number (publication number without country and kind
code), a Google Patents url, assignees, inventors, CPC codes, grant year, and
a `field` derived from the section of the CPC code BigQuery marks as
primary. A patent without an English abstract SHALL be reported and not
written. The command SHALL run one BigQuery job per query, page its result
set by token, and set a maximum bytes billed. Without `GOOGLE_CLOUD_PROJECT`
and `GOOGLE_APPLICATION_CREDENTIALS_JSON` the command SHALL refuse `--source
patents` and say why.

#### Scenario: A patent becomes a document
- **WHEN** `--source patents --query "cold chain sensor"` runs and BigQuery
  returns a publication with an English abstract
- **THEN** a document with `source = "patent"` and that abstract exists, with
  `provenance.patent_number` set and `provenance.field` naming the CPC section

#### Scenario: The same patent from the old source is one row
- **WHEN** a patent ingested under PatentsView as `10123456` is returned by
  BigQuery as `US-10123456-B2`
- **THEN** no second document is written and the line says `existing`

#### Scenario: A page is a resume point
- **WHEN** the command stops after two pages with `--limit`
- **THEN** it prints the job's page token as the cursor and `--cursor <token>`
  continues from the third page without a new job

#### Scenario: No credentials, no run
- **WHEN** `--source patents` runs without `GOOGLE_CLOUD_PROJECT` or
  `GOOGLE_APPLICATION_CREDENTIALS_JSON`
- **THEN** it exits 1 naming the missing variable and writes nothing
