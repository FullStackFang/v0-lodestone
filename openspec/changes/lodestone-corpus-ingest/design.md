## Context

The trimmed app kept `document`, `document_chunk` and `artifact_texts` and
kept `embedPaperAbstracts`, which embeds any `source = 'paper'` document
lacking a chunk. The seed script is the only writer. Ingest is therefore a
writer of the same rows from a network source, plus a source enum value, plus
the surfaces that let a person see what the corpus holds.

## Decisions

### 1. Restore, do not rewrite, the per-work ingest

`openalex.ts` and `ingest.ts` in Whetstone's harness are the modules this
repo deleted; they have tests, they rebuild the inverted index correctly
(every position of a repeated word), and they are idempotent on text hash.
They are copied back byte-for-byte with their tests. The query ingest is a
new module that *calls* `ingestWork` per result rather than reimplementing
the write.

### 2. Search is a cursor loop, and 429 is a resume point, not an error

OpenAlex `/works?search=…&filter=has_abstract:true,from_publication_date:
YYYY-01-01&per-page=200&cursor=*&mailto=…`. The loop prints its cursor every
page. On 429 or network failure it prints the cursor and exits 2. `--cursor
<value>` resumes. Nothing is buffered: a run that dies after page three has
written three pages.

### 3. Patents are documents with `source = 'patent'`, nothing more

The alternative — a `patent` table — would need its own chunk table, its own
branch in `priorArtFor`, `map.ts` and `digest.ts`, and a second embed path.
One enum value gives every reader both kinds for free; `kind` on the hit is
`document.source`. `embedPaperAbstracts` widens its filter to
`source in ('paper','patent')` and keeps its name.

### 4. PatentsView, not Google Patents

Superseded 2026-10 by `lodestone-sources-repair`: PatentsView shut down; patents come from BigQuery.

PatentsView's search API (`https://search.patentsview.org/api/v1/patent/`)
takes a JSON query over `patent_title` / `patent_abstract`, returns abstracts,
grant dates, assignees, inventors and CPC codes, paginates by cursor, and
needs a free key in `X-Api-Key`. Google Patents has no API without BigQuery.
PatentsView's ceiling is 45 requests a minute; the loop sleeps to it.

`field` for a patent is the CPC section letter mapped to its eight names
("A — Human necessities" … "H — Electricity"), so the same-field display on a
hit means something comparable to OpenAlex's `primary_topic.field`.

### 5. Dedupe is on the source's own id, before anything is fetched

`artifact_texts.provenance` already carries `doi` and `openalex_id`; patents
add `patent_number`. A partial unique index on
`(provenance->>'openalex_id')`, `(provenance->>'doi')` and
`(provenance->>'patent_number')` where not null makes a second ingest of the
same work a no-op at the database, and the loop checks the key first so it
skips the `putArtifactText` work. Text-hash dedupe remains for two ids that
resolve to one abstract.

### 6. The query set is provenance

`--set <name>` writes `query_set: <name>` and `query: <text>` into
provenance. The card page and the map read it from there. No `ingest_run`
table: the question "where did this hit come from" is per document, and the
provenance column already answers per-document questions.

### 7. The read endpoint is open to any token

The data is CC0 or public domain; the card's blocks are the thing the API
protects, and this endpoint never touches a card. It still requires a token
so the abuse story stays the same as every other route.

### 8. The retune waits on verdicts

`CLOSE = 0.75` and `PAPER_FLOOR = 0.6` were set on five abstracts. The retune
needs the corpus (this change) and verdicts (Phase 7.3, shipped). The
thresholds file is written with the sample and the chosen values; the code
change is two constants. If the sample is not yet available when everything
else is done, the file records that and the constants stay.

## Open questions

1. **Per-page embedding or end-of-run.** Voyage batches cheaply; embedding
   at the end of a run keeps one code path (`embedPaperAbstracts`). A run of
   five thousand leaves five thousand rows without a vector until it ends.
   Default is end-of-run; revisit after the first real run.
2. **What to embed for a patent.** Claims-style abstracts are stiff. If
   precision on patents is poor in the retune sample, embed `title +
   abstract` for patents only. Not decided until measured.

## Found while applying (2026-10-14)

1. **PatentsView is down.** `search.patentsview.org` does not answer, because
   USPTO paused the PatentsView API on 2026-03-20 while moving it to its Open
   Data Portal, with no return date. `patentsview.ts` is built and tested to
   the PatentSearch v1 shape against a fake `fetch`. A live run stops on its
   first request and prints the failure. When an endpoint exists again, that
   file is the one to repoint. Tasks 6.1 (patent set) and 7.4 wait on it.
2. **OpenAlex needs a key to page.** Cursor paging past the first page answers
   401 without a free `api_key`. `OPENALEX_API_KEY` is passed when set; without
   it every query stops at 200 works with exit 2, which is the designed resume
   path. Task 7.1 (one run of 500) waits on a key.
3. **Stub abstracts.** About 5% of `has_abstract:true` works carry a subject tag
   ("Digital", "International audience") as the abstract. Their vectors sit
   close to every card, and in the first retune sample they pulled precision at
   5 down to 0.13. The ingest command refuses an abstract under
   `MIN_ABSTRACT_WORDS = 30` as `short_abstract`. See
   `evals/lodestone/thresholds.md`.
