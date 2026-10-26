## Context

- `lodestone-research-review` shipped these pieces:
  - `searchPapers`, which runs kNN over `document_chunk` with HNSW oversampling for a set
  - `openalexHits`, which returns live hits and writes nothing
  - `mergeHits`
  - the `--source xlsx` ingest
- All of them were exercised only against local PGlite.
- The client API (`src/app/api/lodestone/`) already resolves an `lst_` bearer token to a
  person through `withToken`, and answers errors as `{ error }`.
- `GET /papers/[documentId]` already serves one corpus document to any live token.
- Production is Neon Postgres with pgvector, reached through `DATABASE_URL`.
- `createPostgresDb` does not migrate in production; `npm run db:migrate` is the release
  step.
- `lodestone-corpus-compact` already made storage lean:
  - one copy of each abstract, in `artifact_texts`
  - `document.text` and `document_chunk.text` are null for papers
  - halfvec(1024) embeddings

## Goals / Non-Goals

**Goals**
- The NeurIPS set is searchable on the published Lodestone.
- One HTTP search that Whetstone and any later client call the same way.
- The route and the CLI cannot disagree, because they share one function.

**Non-Goals**
- Quotas, metering, MCP, or public signup (see the proposal).
- Ingesting OpenAlex hits through the API.
- Any change to ranking.

## Decisions

### Shared corpus, per-person everything else
- Search reads only corpus documents (`CORPUS_SOURCES`). These belong to no person, so the
  route does not filter by the token's person.
- The token still gates the route, the same way the paper read is gated. That keeps one
  story for abuse across the API, and gives each search a person to attribute later
  metering to.
- Per-person data, meaning cards and later reviews and links, stays filtered by person as
  it is today.
- *Alternative:* an unauthenticated public search. It was rejected: every search spends a
  Voyage call, and an open endpoint invites a bill.

### The body: several questions, one list
- The body is `{ q: string | string[] (1–4, each 1–2000 chars), k?: 1–50 (default 20),
  set?: string, openalex?: boolean }`.
- Several questions run in parallel and are merged with `mergeHits`. Week 1 found that one
  long question drifts, and that a question should be searched as its sub-claims.
- The ceiling of 4 matches the `research-review` skill's 2–4 sub-claims, and caps the
  Voyage and OpenAlex fan-out per request.
- *Alternative:* one question per request, with the client merging. It was rejected
  because every client would re-implement `mergeHits`.

### The response
- The response is `{ hits: PaperSearchHit[], openalex: { stopped: string | null } | null }`.
- The hit shape is exactly what `search.json` holds today, so the `research-review` skill
  and Whetstone read one format.
- Absent metrics are `null`, because unknown is not zero.
- `openalex` is null when it was not asked for. When asked, `stopped` carries the reason
  OpenAlex stopped early. A partial live list must say it is partial.

### No key is 503, not an empty list
- `searchPapers` throws without a query vector, and the route maps that throw to 503.
  An empty 200 would read as "nothing relevant".
- This is the one error not routed through `withToken`'s 400 mapping, so the route catches
  it first.

### Abstracts are returned in full, to token holders only
- Whetstone's `support` rows must be substrings of the abstract a run read, so a client
  that weighs a paper needs the full text.
- The tokens today are the author's and the pilot members'.
- The existing paper-read route's comment says its corpus is "CC0 or public domain". That
  is true of OpenAlex and patents but not of the NeurIPS sheet, whose abstracts belong to
  their authors. This change corrects the comment.
- It records the gate: before a key is issued to anyone outside the pilot, the NeurIPS
  abstracts are either cleared for that use or cut to title, link, metrics and a short
  excerpt for set `neurips-2021-2026`.
- *Alternative:* cut to excerpts now. It was rejected because it breaks the one client that
  exists, for a risk that starts with a public key.

### The load is the existing script against production
- Running `lodestone:ingest --source xlsx` with production's `DATABASE_URL` reuses the code
  that loaded PGlite, including dedupe by `neurips_id` and by hash.
- `process.loadEnvFile` does not override a variable already set, so a shell-provided
  `DATABASE_URL` wins over `.env.local`. This is verified before the run, and the run
  prints the host.
- *Alternative:* copy the vectors from local PGlite and skip re-embedding. That saves about
  $0.40 but needs a new copy script, and it would carry the local database's history along
  with it.

## Risks / Trade-offs

- **[Neon storage cap]** → Measure `pg_database_size` before loading, against the plan's
  limit. The estimate is 200–300 MB. PGlite grew by 425 MB, but that includes WAL.
  - If it doesn't fit, stop and ask: either upgrade the plan or load a subset by year.
    Do not trim text, since the one-copy layout is already minimal.
- **[A long load against a remote database]** → Each row is one transaction over the
  network, so the run may take an hour or more. The ingest is idempotent, so an
  interrupted run is resumed by running it again.
- **[Function duration]** → A request does at most 4 Voyage calls and 4 OpenAlex searches.
  `openalexHits` already obeys the OpenAlex limiter and stops early with a reason, rather
  than hanging.
- **[`set local hnsw.ef_search` behind the Neon pooler]** → `set local` lives inside the
  transaction, which transaction pooling keeps on one connection. The production smoke
  check confirms that a set-filtered search returns `k` hits.
- **[Licensing]** → Gated as above. The gate is written into the route's comment so it
  cannot be missed when keys widen.

## Migration Plan

1. Merge and push, so Vercel deploys the route. The route is harmless before the load: it
   searches whatever is stored.
2. `npm run db:migrate` with production's unpooled URL. It prints the host.
3. Check `pg_database_size` against the Neon plan.
4. Run `lodestone:ingest --source xlsx --set neurips-2021-2026` with production's
   `DATABASE_URL` and `VOYAGE_API_KEY`.
5. Smoke check: with the author's token, POST a search to the live URL, and confirm 10 hits
   from the set.

**Rollback:**
- Take the set's document ids: those whose latest `artifact_texts.provenance->>'query_set'`
  is `neurips-2021-2026`.
- In one transaction, delete their `document_chunk` rows first, then their
  `artifact_texts`, then the `document` rows. Only `document_sentence` cascades, and
  `artifact_texts.artifact_id` has no foreign key.
- Revert the route commit if needed.

## Open Questions

- What is the Neon plan's storage limit? Answered at step 3, before anything is written.
