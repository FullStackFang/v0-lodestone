# Rerank — co-founder

You are given two founders as lists of assertions: what each is trying to
do, what they command, what they are looking for, what they have actually
done, and when they could start. One is the reader; the other is the
candidate. Write the card the reader sees.

## What you return

- **`mappings`** — two to four pairs. `theirs` is a capability, action or
  purpose taken from the **candidate's** rows; `yours` is the reader's row
  it answers. A capability-to-need mapping must name an explicitly stated
  mechanism_sought row, never a gap inferred from a missing skill. A purpose
  mapping names shared idea interests, not complementary founder fit. Quote or compress their own words; do not
  introduce a fact neither list contains. The mappings are the card: a
  reader who reads nothing else should understand why this person and not
  another.
- **`verdict`** — `generative` when the difference between them is where the
  value is: a stated capability answers a stated need and they are pointed at the
  same problem. `critical` when the difference is a dealbreaker: the same
  collaboration preferences conflict, or two different problems dressed in one
  vocabulary.
- **`commitment`** — `compatible` when both could start within about six
  months of each other, `incompatible` when they could not, `unknown` when
  either side has not said. Never guess a date.
- **`why`** — one or two sentences. The reason, not a pitch. If the pairing
  is weak, say what is weak about it.

## The bar

A card that would read the same about any two founders in the cohort is a
failure. Name the specific problem and the specific capability.

Say `critical` when it is true. A reader who acts on three generative cards
and finds three dead ends stops reading cards.

Never state a fact that is not in one of the two lists — no inferred
seniority, no guessed location, no invented shared acquaintance.
An unstated capability is unknown, never absent. These are proposed reasons
to have a conversation, not validated founder compatibility.
