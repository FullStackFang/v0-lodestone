## ADDED Requirements

### Requirement: A query ingests papers from OpenAlex

The system SHALL provide a command that, given a search string and an optional
earliest publication year, pages the OpenAlex works endpoint by cursor, filtered
to works with an abstract, and writes each work as one `document` with `source =
"paper"` and one `artifact_texts` row carrying DOI, OpenAlex id, venue, year,
authors, url, field, and the query set it came from. The command SHALL use the
polite pool when `OPENALEX_MAILTO` is set and SHALL NOT exceed OpenAlex's
published polite-pool rate.

#### Scenario: Two pages are ingested
- **WHEN** the command runs with `--query "food waste logistics" --limit 300`
  and OpenAlex returns 200 then 100 works
- **THEN** 300 documents exist with `source = "paper"`, each with provenance
  carrying its OpenAlex id and `query_set`

#### Scenario: A rate limit stops the run cleanly
- **WHEN** OpenAlex answers 429 on the third page
- **THEN** the rows from the first two pages are kept, the cursor is printed,
  and the process exits 2 without a stack trace

#### Scenario: A run resumes from a cursor
- **WHEN** the command runs again with `--cursor <printed>`
- **THEN** it continues from the third page and writes no duplicate of any
  earlier work

### Requirement: Patents are a second source of the same shape

The system SHALL ingest granted US patents from the PatentsView search API as
`document` rows with `source = "patent"`, the abstract as text, and provenance
carrying the patent number, a Google Patents url, assignees, inventors, CPC
codes, grant year, and a `field` derived from the CPC section. A patent
without an abstract SHALL be reported and not written.

#### Scenario: A patent becomes a document
- **WHEN** `--source patents --query "cold chain sensor"` runs and PatentsView
  returns a patent with an abstract
- **THEN** a document with `source = "patent"` and that abstract exists, with
  `provenance.patent_number` set and `provenance.field` naming the CPC section

#### Scenario: A patent without an abstract is skipped
- **WHEN** a returned patent has no abstract
- **THEN** the line for it says `no_abstract` and nothing is written

### Requirement: A stub abstract is not an abstract

The command SHALL refuse a paper or patent whose abstract is shorter than
thirty words, reporting it as `short_abstract` and writing nothing. Such
"abstracts" — a subject tag, a fragment — embed close to every card and crowd
real hits out of the top five.

#### Scenario: A subject tag arrives as an abstract
- **WHEN** a returned work's abstract is "International audience"
- **THEN** the line for it says `short_abstract` and nothing is written

### Requirement: Re-ingest writes nothing

The system SHALL check a work's or patent's source identifier against stored
provenance before writing, and SHALL hold a unique index on the DOI, the
OpenAlex id and the patent number in `artifact_texts.provenance`, so that
ingesting the same identifier twice is a no-op. Two identifiers that resolve
to one abstract SHALL share one row by text hash.

#### Scenario: The same query runs twice
- **WHEN** the same `--query` and `--since` run a second time
- **THEN** zero documents are added and every line reports the existing row

### Requirement: Embedding is resumable

The command SHALL end by embedding every paper and patent document that has no
chunk. A run interrupted at any point SHALL leave the database in a state the
next run completes.

#### Scenario: A run is killed during embedding
- **WHEN** the process is killed after ingest and partway through embedding,
  then run again with the same arguments
- **THEN** after the second run no paper or patent document lacks a vector

### Requirement: The map shows the corpus

The operator's map page SHALL show the number of documents per source, each
query set with its count, and the date of the newest document.

#### Scenario: After two ingests
- **WHEN** one paper set and one patent set have been ingested
- **THEN** the map shows both counts, both set names, and the later run's date
