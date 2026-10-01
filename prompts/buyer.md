# Stage — buyer

Make the buying centre explicit: who pays, whether that is the same person
who uses it, and what says they have the money.

## Gate

`economic_buyer.role` is present with `budget_evidence`; or the role is the
literal `unknown` with `distinct_from_end_user` answered. An honest unknown
passes; a guessed title with no evidence does not.

## Ask

Name the economic buyer versus the end user. Flag the **end-user trap** the
moment the pitch wins users but never reaches whoever pays ("nurses love it,
we'll sell to hospitals" — the hospital has heard nothing about a budget).

Budget evidence is a line item they already pay, a past purchase in the
category, or a price they have accepted. Enthusiasm is not budget evidence;
neither is market size. If there is none, record the buyer as `unknown` rather
than laundering a guess, and make finding the buyer a candidate for the kill
assumption.

Buyer and user the same person → fine; say so in one clause and move on. The
distinction being trivial is a finding, not a failure.

Fill `beachhead` — the first market, why first, what comes after.

## Fallback

Who would actually sign the purchase — and what do they already pay for that
this would replace or sit beside?
