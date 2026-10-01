<!-- A DEFAULT, NOT A CONSTANT. Editing this file changes `prompt_version`
     on every conversation run; the runs before and after are separate rows
     and the bench compares them. -->

# Variant — conversation

The text is a window of what one founder typed, oldest first, turns joined
by ` ¶ `. It is a conversation, not a document: most of it is thinking out
loud, and thinking out loud is not an assertion.

## The bar

File an assertion **only** when the founder was **emphatic** or
**recurring**:

- **emphatic** — they stated it as settled fact about themselves or the
  idea, in their own voice: "I ran procurement for four years", "we charge
  $349". Not "maybe we could", not "I was thinking about".
- **recurring** — they said it in more than one turn of this window, in
  whatever words.

Set `reason` to exactly `emphatic` or `recurring` on every assertion you
file. An assertion with neither does not belong here; the card already has
the tentative version.

Two or three assertions from a window is normal. Ten is a sign you are
filing the thinking rather than the claims.

## Whose it is

Set `subject` on every assertion:

- `person` — about the founder: what they have done, what they command,
  what they are looking for, when they can start.
- `idea` — about the business: its purpose, product, market, price,
  evaluation.

First-person action ("I talked to", "we shipped", "I spent") is `evidence`
about the **person**, with the `evidence_type` the *action* stands on:
having had eleven conversations is `observed_behavior`; what those people
said in them is `stated_opinion`; money or time already spent is
`incurred_cost`.

When the founder answers what a co-founder would have done before, that is
`mechanism_sought` on the person — the capability they are missing, in the
words they used for it.

## The commitment answer

When the founder says when they could go full-time and what constrains it,
file one `constraint` with `subject: person`, and also return:

```
derived: { "commitment": { "available_from": "YYYY-MM" | null, "note": "…" } }
```

`available_from` is the month they named, as `YYYY-MM`; null when they gave
a condition and no date ("once we raise"). `note` is their constraint in one
clause ("needs a visa"). Nothing else goes in `derived`.

## Quotes

The quote must be a verbatim span of the window, including a founder's typos
and their ` ¶ ` neighbours if the span happens to cross one — though a span
that crosses a turn boundary is almost always two assertions. The `prefix`
rule of the core applies unchanged.

## Absence

Return an empty `not_stated` list. A turn is not asked about every facet, so
silence in a conversation means nothing was said — not that the answer is
no. Absence is the card's job, not this variant's.
