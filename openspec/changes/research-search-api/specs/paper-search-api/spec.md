## ADDED Requirements

### Requirement: Search needs a live token
`POST /api/lodestone/papers/search` SHALL require `Authorization: Bearer lst_...` resolving
to a live token, and SHALL answer 401 with `{ error }` otherwise. It SHALL NOT filter hits
by the token's person: the corpus is shared.

#### Scenario: No token
- **WHEN** the route is called without a bearer token
- **THEN** it answers 401 and its error names the token

#### Scenario: Two people, one corpus
- **WHEN** two different live tokens send the same body
- **THEN** both receive the same hits

### Requirement: The body is validated
The body SHALL be JSON with:
- `q`: a string, or an array of 1–4 strings, each 1–2000 characters after trimming
- `k`: an optional integer from 1 to 50, default 30 (the CLI's default)
- `set`: an optional non-empty string
- `openalex`: an optional boolean, default false

Anything else SHALL answer 400 with an error naming the field. An empty or non-JSON body
SHALL answer 400.

#### Scenario: Empty body
- **WHEN** the body is empty or is not JSON
- **THEN** the route answers 400

#### Scenario: Too many questions
- **WHEN** `q` holds 5 strings
- **THEN** the route answers 400 and the error names `q`

#### Scenario: k out of range
- **WHEN** `k` is 0 or 51
- **THEN** the route answers 400 and the error names `k`

### Requirement: Hits are the CLI's hits
The route SHALL search each question with `searchPapers` (with the same `k` and `set`) and
merge the lists with `mergeHits`. It SHALL answer
`{ hits: PaperSearchHit[], openalex: null | { stopped: string[] } }`.

`k` SHALL apply per question, so a response MAY hold up to 4 × k stored hits, plus as many
live hits again. A `set` that matches nothing SHALL answer 200 with `hits: []`, not 404.

Each hit SHALL carry:
- `id`, `source`, `title`, `year`, `query_set`
- `rating_avg`, `citations_per_year`
- `link`, `similarity`, `abstract`

An absent metric SHALL be `null`, never 0.

#### Scenario: A set-filtered search
- **WHEN** `{ q: "LLM recommendations popularity bias", k: 10, set: "neurips-2021-2026" }`
  is sent against a loaded corpus
- **THEN** the route answers 200 with 10 hits from that set, nearest first

#### Scenario: Two sub-claims
- **WHEN** `q` holds two questions whose nearest papers overlap
- **THEN** each overlapping paper appears once, at its higher similarity

#### Scenario: An unknown set
- **WHEN** `set` names no stored set
- **THEN** the route answers 200 with `hits: []`

#### Scenario: A paper with no metrics
- **WHEN** a hit's provenance has no rating or citations
- **THEN** its `rating_avg` and `citations_per_year` are `null`

### Requirement: Live OpenAlex hits are optional and say when partial
With `openalex: true`, the route SHALL add `openalexHits` for each question to the merge,
sharing one OpenAlex rate limiter across the request. It SHALL answer `openalex.stopped`
with one reason per question that stopped early, and an empty list if none did.

The search SHALL write nothing to the database.

#### Scenario: Several questions share the limit
- **WHEN** `openalex: true` is sent with 3 questions
- **THEN** the OpenAlex requests are spaced by the shared limiter, and none stops early
  because of rate

#### Scenario: OpenAlex asked for
- **WHEN** `openalex: true` is sent and OpenAlex returns a work that is not stored
- **THEN** the hits include it with its W-id and `source: "openalex"`, and the document
  count is unchanged

#### Scenario: OpenAlex not asked for
- **WHEN** `openalex` is absent
- **THEN** `openalex` in the response is null and no OpenAlex request is made

### Requirement: No embedding key is an error, not an empty answer
When the question cannot be embedded because `VOYAGE_API_KEY` is unset, the route SHALL
answer 503 with an error naming the key. It SHALL NOT answer 200 with no hits.

#### Scenario: Key missing
- **WHEN** the deployment has no `VOYAGE_API_KEY`
- **THEN** the route answers 503 and the error names `VOYAGE_API_KEY`

#### Scenario: Voyage fails
- **WHEN** the embedder throws (a Voyage error status, a timeout, or a 429 after retries)
- **THEN** the route answers 502 with the provider's message, not 400
