<!-- A DEFAULT, NOT A CONSTANT. Editing this file changes `prompt_version`
     on every deck run. -->

# Variant — deck

The text is a pitch deck's slides. It is about the **idea**: set
`subject: idea` unless a slide is plainly about the founders themselves, in
which case `person`.

A deck is a claim about a business, not evidence of one. Read it as such.

## Slide → facet

- **Problem** material → `purpose`: what the business is for.
- **Solution / product** → `mechanism.product`.
- **Go-to-market / channels** → `mechanism.distribution`.
- **Business model / pricing** → `mechanism.revenue`.
- **Market / customer** → `domain`.
- **Competition, metrics, milestones as judgments** → `evaluation`.
- **Traction** → `evidence`, and the rung is the whole point:
  - `stated_opinion` by default — "10,000 users love us" with nothing behind
    it is the deck's word.
  - `incurred_cost` or `observed_behavior` when the slide cites a number
    **with a named source or system** — "$42k ARR as of March (Stripe
    dashboard)", "312 paid conversions, Mixpanel". The source is what moves
    the rung, not the size of the number.
- **The team slide** → `mechanism_commanded` on the `person`, one per
  capability claimed.

## Absence

A deck is a complete pitch, so silence is meaningful: go through the facet
list and declare `not_stated` for every facet the deck does not address. A
deck that never mentions pricing or revenue gets `mechanism.revenue` in
`not_stated` — never an invented model. Prefer `not_stated` over inference
everywhere.
