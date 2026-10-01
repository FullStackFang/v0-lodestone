<!-- A DEFAULT, NOT A CONSTANT.
     The `abstract` variant: one research abstract in, assertions out. This
     is the file the prompt loop edits and `bench -- gold|coda|silver`
     scores. Editing it changes `prompt_version`, so the runs before and
     after are separate rows. Never edit it to make one abstract come out
     right. -->

# The text is a research abstract

One abstract, a few hundred words, written to be read by other researchers.
It states what the authors were trying to do, what they did, and what they
found. It rarely states a price, a channel or a business model, and you are
not to supply one.

## The five facets to look for

- `purpose` at `specific` — what this work was trying to achieve. Most
  abstracts state one; some state two. The purpose is the problem, not the
  method: "cut the time from sample to result in clinics without a lab" is a
  purpose, "a lateral-flow assay" is not.
- `mechanism` — how they did it. **Use the untyped `mechanism` unless the
  abstract itself frames the work commercially.** A method, a technique, an
  architecture, a protocol, a study design: all `mechanism`. Reach for
  `mechanism.product` only where the text names a thing offered to someone,
  `mechanism.distribution` only where it names how it reaches them,
  `mechanism.revenue` only where it names money, and `mechanism.capability`
  only where it names something the authors can do that made the rest
  possible. A paper's method is not a product.
- `constraint` — what bounded the work or bounds its use: a cost ceiling, a
  regulation, a sample size the authors call limiting, a setting without
  power or a network.
- `domain` — the field and setting: "rural primary care", "perovskite
  photovoltaics", "cable-stayed bridges". One or two, not a list of
  keywords.
- `evaluation` — how the claim is judged: the measure, the comparison, the
  number. "F1 against 50 annotated abstracts" is an evaluation; "we show it
  works" is not.

## Quotes and prefixes

Every assertion carries a quote copied character for character out of the
abstract, and a `prefix` of **at most five words** that immediately precede
it. The prefix is how a short quote is placed when the same words occur
twice; a wrong prefix costs the assertion. When the quote begins the text
the prefix is the empty string.

Prefer a quote of a handful of words over a whole sentence: the span is what
the reader's own highlight is compared against, and a sentence that carries
three claims cannot be the evidence for one of them.

## What the abstract does not say

Go through the five facets above and list every one the abstract is silent
on in `not_stated`. An abstract with no evaluation must say so — a missing
`evaluation` row means "never asked", and this is a text where it was asked.

Most abstracts are silent on `mechanism.revenue` and
`mechanism.distribution`. Say so; do not invent a business model, a channel
or a price, and do not read one in from the venue.

## The transferable insight

Return, in `derived`, a single key `transferable_insight`: one sentence
naming what someone **outside this paper's field** could take from it. Not a
summary — the mechanism at the level where it stops being about this domain.

> A cheap proxy measurement, taken continuously, beats an accurate one taken
> rarely when the thing you are watching drifts slowly.

It carries no quote and it is not an assertion: it is synthesis, and it
rides on the run so a card can show it. Write one sentence, not two. If the
abstract genuinely generalizes to nothing, say that in one clause rather
than inventing a lesson.
