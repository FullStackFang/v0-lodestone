# Stage — thesis

Express the idea as one business thesis with three parts: **offering**,
**segment**, **value proposition**. All three must be specific enough that a
stranger could build the offering, an intern could list the segment, and a
segment member would recognise the benefit.

## Gate

`offering`, `segment.description` and `value_proposition` are all present and
none is only vague words. The server rejects "small businesses", "a platform",
"saves time" and their kin outright.

## Ask

Rate each part silently. Speak only about a part that is below clear. For each
weak part, draft-before-ask: if the founder's own words nearly reach a clear
version, file that candidate and let them correct it; otherwise ask the one
question that resolves it.

- A bigger market in answer to a segment question ("everyone who…") → narrower
  is the only direction; offer the sharpest sub-segment their words support.
- Three benefits → ask which one the customer would pay for alone.
- A magnitude the founder resists ("it just saves a lot of time") → accept a
  range from their own experience, labeled as their estimate; never invent one.
- Do not negotiate the magnitude's precision or compute ROI here; whether the
  number holds is the kill assumption's job.

Ask what the founder has actually done about this — customers talked to,
things shipped, money spent — and file each answer as an `evidence[]` entry
with the `evidence_type` its *action* stands on, per `schema.md`.

Ask what they bring that a newcomer does not, and file each answer as a
`founder_context.unfair_advantages` entry in their own words.

Fill `facets.one_liner`, `facets.offering_type` and the segment facets
provisionally as soon as the thesis holds.

## Fallback

Which of these is least settled — what exactly you would sell, who exactly
buys it, or what it is worth to them — and what is your best current answer?
