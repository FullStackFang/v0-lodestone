## Why

A prior-art hit is a title, a cosine and the name of the block it came
closest to. Whetstone's "Weigh against the canvas" (`forge-paper-support`)
then pulls the whole abstract and spends an author's model run finding the
sentence that bears on the block. That is the right division — Lodestone
finds, Whetstone reads — but Lodestone can do more of the finding without
breaking its rule. It holds the block's vectors and the abstract; the three
sentences of the abstract nearest the block are a vector lookup, not a model
call. Returned with the hit, they are the "why" in the panel before the
author decides whether to read, and the raw material Whetstone's model turns
into a paragraph instead of starting from the title.

Half of what a search can return has no abstract to take sentences from.
OpenAlex reports abstracts for 55% of its default view; Elsevier and
Springer Nature pulled many closed-access ones. Today ingest refuses those
works (`no_abstract`), so they never become hits. When a card's search brings
back a work that is plainly relevant and has only a title and a Semantic
Scholar TLDR, dropping it hides the finding; ranking it as if the TLDR were
an abstract overstates what Lodestone knows. The hit should carry it and say
it is thin.

## What Changes

- **Sentences per hit.** `PaperHit` gains `sentences: [{ text, block,
  cosine }]` — the three sentences of the abstract with the highest cosine to
  any entry vector of the hit's best block, in abstract order, `block` being
  the key — and `abstractHash`, the hash of the text they were cut from.
  Computed from a `document_sentence` table filled when a search completes
  or on first read, and re-cut when the abstract changes.
- **Thin documents.** A work with no abstract but a title and a TLDR (from
  Semantic Scholar, when the search path has one) is ingested with the TLDR
  as its text, `source_format = "tldr"` (a new enum value), and
  `provenance.thin = true`. The thirty-word floor does not apply to a thin
  document. A thin hit carries `thin: true` and its `sentences` is the TLDR
  as one sentence. A thin document is ordered as if its cosine were
  multiplied by `THIN_FACTOR` (0.9), inside the ranking statement, so a full
  abstract at the same closeness outranks it; its `score` stays the plain
  cosine. A thin document whose abstract later appears on OpenAlex is
  upgraded on the next search that returns it.
- **The read endpoint.** `GET /api/lodestone/papers/<id>` returns `thin` and,
  for a thin document, `abstract` is the TLDR with `abstractKind: "tldr"`.
- **Digest.** A thin hit in the digest says "summary only" after its title.

## Capabilities

### New Capabilities
- `hit-sentences`: each prior-art hit names the abstract sentences nearest
  its block; documents without an abstract are kept as thin and marked.

### Modified Capabilities
- `paper-read`: `thin` and `abstractKind` on the response.
- `prior-art-ranking`: thin documents are ordered at 0.9 of their cosine;
  `score` is unchanged.
- `corpus-ingest`: `ingestWork` accepts a TLDR for a work without an
  abstract and can replace a thin row.

## Non-goals

- No model writes anything on the server. Sentence selection is cosine.
- No full text. The sentences come from the abstract Lodestone already holds.
- Thin documents are not fetched from other sources to fill the abstract.
  If a later ingest brings the abstract, the row is replaced as any abstract
  edit is, and `thin` clears.
