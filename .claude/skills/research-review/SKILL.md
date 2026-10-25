---
name: research-review
description: >-
  Turn a research question into research/<slug>/ in Lodestone: search the stored
  papers (the NeurIPS 2021–2026 corpus and live OpenAlex), write a review in a
  fixed shape that cites only search hits, three six-field smoke tests, and a
  links.json validated against the store. Use when the author asks to review,
  check or stress-test a research idea against the literature, or names
  research-review.
---

# Research review

A question goes in. A folder comes out, holding:
- a review that says what holds up, what is taken and where the gap is
- smoke tests cheap enough to run this week
- links that point only at papers Lodestone actually stores

You do the reasoning. The scripts do everything that touches data.

## Inputs

- **The question**: text, or a file the author names. Keep the author's own words.
- **A slug**: short and kebab-case, such as `popularity-quality`. If the author gave none,
  pick one and say which.

## Before anything

- Every command runs from the Lodestone repo root, the directory holding `package.json`.
  It reads `data/pglite` relative to the working directory.
- `next dev` must be stopped. PGlite allows one process at a time, and a script started
  while the server holds the directory fails at open. Ask the author to stop it; do not kill
  it yourself.
- `VOYAGE_API_KEY` must be set in `.env.local`. Search refuses to run without it.

## Order of work

1. **Write `research/<slug>/question.md`.** Put the question verbatim under a `# <title>`
   line, and nothing else.
2. **Search, once, into `search.json`.** Split the question into its two to four
   sub-claims and give each its own short `--q`. One long query drifts toward whichever
   word is most common in the corpus. Hits are merged, each paper once.

   ```bash
   npm run lodestone:search -- --q "<sub-claim 1>" --q "<sub-claim 2>" --set neurips-2021-2026 --k 20 --openalex --json research/<slug>/search.json
   ```

   - Read the printed list and the abstracts in `search.json`.
   - If the hits are off-topic, re-run with tighter queries and overwrite the file. The
     review may cite only the final `search.json`.
3. **Write `review.md`**, in the shape below.
4. **Write `smoke-tests.md`**, in the shape below.
5. **Write `links.json`.** It maps every claim, gap and smoke test in the review to the
   papers behind it (shape below).
6. **Validate:**

   ```bash
   npm run lodestone:research-links -- research/<slug>
   ```

   This rewrites `links.json`:
   - An id that was not in `search.json` moves to `unresolved` as `not_in_search`.
   - A cited OpenAlex W-id is ingested and becomes its document id. If OpenAlex has no
     usable abstract, it moves to `unresolved` with the status (`short_abstract`,
     `no_abstract`, `not_found`).
7. **Fix what is unresolved.** For each entry, find the sentence in `review.md` or
   `smoke-tests.md` that cited it, then do one of two things:
   - Re-cite it to a resolved hit that actually says the same thing.
   - Drop the claim, or mark it `(uncited)` and say so in plain words.

   Never leave a citation to an unresolved id. Re-run step 6 if you changed `links.json`.
8. **Tell the author** where the folder is, the resolved and unresolved counts, and the
   first smoke test to run. Findings first. No summary of your own effort.

## Citing: only by search id

- Every paper the review names is cited by an `id` from `search.json`, written inline as
  `[id]`.
  - A stored hit is its document UUID.
  - A live OpenAlex hit is its W-id. The validator turns it into a UUID in `links.json`;
    leave the W-id in the prose.
- Do not cite a paper from memory, from training data, or from an abstract's own reference
  list. If the claim needs a paper the search did not return, the claim is `(uncited)`.
- A hit's abstract is all you know about it. Do not claim results the abstract does not
  state.
- `rating_avg` and `citations_per_year` are `null` for 2026 papers, and for papers the
  sheet had no data on. Unknown is not zero: never read a missing rating as a low one.

## `review.md`: these sections, in this order

```markdown
# <question title>

## What holds up
## What needs correcting
## What's already taken
## The real gap
## Top 5 studies
## Sequencing
## Biggest risk
## Sources
```

- **What holds up / needs correcting**: the parts of the author's reasoning the literature
  supports, and the parts it contradicts or that are simply wrong. Cite each one.
- **What's already taken**: each taken direction names the papers that took it.
- **The real gap**: what nobody in the hits has done, stated narrowly enough to be tested.
- **Top 5 studies**: numbered. For each, one line on the question, the data and the
  expected signal.
- **Sequencing**: which study runs first and why, and what result would change the order.
- **Biggest risk**: the one thing most likely to make the idea not work.
- **Sources**: every cited id, one per line, as `[id] Title (year): link`, copied from
  `search.json`.

## `smoke-tests.md`: one per study, for the top 3 studies

Each smoke test has a `## <study name>` heading and these six fields, each filled:

- **Hypothesis**: one falsifiable sentence.
- **Measurement**: the exact statistic or count, computed how.
- **Threshold**: a number, fixed now, before anything runs. "Spearman ρ ≥ 0.30" is a
  threshold; "a meaningful correlation" is not.
- **Kill means**: what the author stops doing if the threshold is missed.
- **Data**: what it reads. It must be on hand, such as the NeurIPS sheet, or fetchable
  within an hour.
- **Time**: hours to run, at most 8. State the cost too, at most $20.

If a drafted smoke test has no numeric threshold, or breaks a limit, rewrite it before
saving. A smoke test without a number is never saved.

## `links.json`

```json
{
  "items": [
    {
      "text": "Popularity bias in LLM recommenders is already measured.",
      "kind": "claim",
      "links": [{ "id": "<id from search.json>", "relation": "taken_by", "quote": "<a phrase from that hit's abstract>" }]
    }
  ],
  "unresolved": []
}
```

- `kind` is one of `claim`, `gap` or `smoke_test`.
- `relation` is one of `supports`, `contradicts` or `taken_by`.
- `quote` is copied from the hit's abstract. It is the evidence for the link, so do not
  paraphrase it.
- `text` is the sentence as it appears in `review.md` or `smoke-tests.md`, so an
  unresolved entry can be found again.
- Week 2 imports this file unchanged into Whetstone's `work_link`, so keep to the shape.
