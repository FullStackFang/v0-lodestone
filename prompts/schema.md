# The card's fields — what each one means

The exact JSON shape is enforced by the output schema; this is what goes in
each field. Strings are nullable: null means "not yet", never "none".

## Core (thesis)

- `idea_text` — the founder's idea in their words, as given. Set once at intake
  from the pitch or material; do not rewrite it.
- `offering` — the concrete thing sold. Not "a platform"; the actual thing,
  buildable by a stranger from the sentence. "A $349/mo SaaS that fills
  cancelled slots from an SMS waitlist."
- `segment.description` — who specifically buys: a role in a situation, not a
  market. "Owner-dentists at single-location US practices." An intern given
  only this sentence could list 100 real prospects in a day.
- `value_proposition` — the one benefit that matters, in the customer's words,
  with a rough magnitude that shows it is material. A benefit, never a feature.
  Precision is not the point; materiality is.

## Segment

- `segment.findability_evidence` — how you would list them (a directory, a
  license registry, a trade association, a job title on LinkedIn).
- `segment.homogeneity_claim` — why they share the #1 unmet need and the
  channels to reach them.
- `segment.size_estimate` — order of magnitude, labeled as an estimate.
- `segment.four_question_test` — the index-card test, four answers each
  `yes | maybe | no`: could interns list 100 real prospects in a day; do more
  than 80% share the top unmet need; does one go-to-market reach most of them;
  can most afford or justify the price. Answer from the card, not from hope.
- `segment.refinement` — when one answer is `maybe`, the narrowing that would
  turn it to yes.

## JTBD

- `jtbd.job_statement` — the job the economic buyer hires the offering to do;
  it existed before the offering did.
- `jtbd.functional` / `emotional` / `social` — the outcome needed; how they
  want to feel; how they want to be seen. B2B buyers have all three (looking
  competent to a boss is social; fear of an audit is emotional).
- `jtbd.current_workaround` — what they do about it today. If the answer is
  "nothing", the problem may not be a problem.
- `jtbd.passes_member_test` — would a member of the segment, hearing the value
  proposition, say yes or no rather than "it depends"? True only when the
  value proposition is in their language with a magnitude they would
  recognise.

## Buyer

- `economic_buyer.role` — who signs. The literal string `unknown` is allowed
  and honest; a guessed title is not.
- `economic_buyer.distinct_from_end_user` — whether the payer is a different
  person from the user. When true, the pitch must reach the payer.
- `economic_buyer.budget_evidence` — a line item they already pay, a past
  purchase in the category, a quoted price they accepted. Enthusiasm from the
  end user is not budget evidence.
- `beachhead` — the first market, why it is first, and the adjacent markets
  after it.

## Problem magnitude

- `four_us` — unworkable, unavoidable, urgent, underserved; each an answer and
  a one-line rationale. A yes without a rationale is a no.
- `facets.quadrant` — painkiller (urgent + underserved), vitamin (nice, not
  necessary), jet_fuel (makes money for the buyer), candy (pleasant, forgotten).

## Rubric — eight factors, always all eight

Each factor: `score` 1–5, `confidence` low | med | high, a `rationale`, and the
`evidence_type` the score stands on:

- `observed_behavior` — the founder saw customers do it or pay for it
- `incurred_cost` — customers already spend money or time on a workaround
- `stated_opinion` — customers said they would
- `model_inference` — you reasoned it from the card; nothing from the field

Factors: `market_size`, `cost_to_launch`, `value_prop_clarity`, `margins`,
`competitive_advantage`, `problem_magnitude`, `whole_product` (how much of
the full solution the offering is, versus what the customer must assemble),
`team_market_fit` (the founder's unfair advantage for this segment).

A score with no field evidence is `model_inference` at low confidence. That is
fine and expected on a new card; mislabeling it is not.

## Kill assumption

- `kill_assumption.assumption` — the single assumption that, if wrong, kills
  the concept. The most load-bearing, not the most uncertain.
- `kill_assumption.falsifiable` — true only if a specific result would disprove
  it.
- `kill_assumption.cheapest_test` — the test: `description`, `days` it takes
  (must be 14 or fewer), and `kill_criterion` — the result that kills the
  thesis. Prefer evidence of incurred cost over stated opinion.

## Evidence — what the founder has actually done

- `evidence[]` — one entry per action the founder has already taken about this
  problem: customers talked to, things shipped, money or time spent. `text` is
  the action in one line ("talked to 11 owner-dentists in March"), never a
  plan and never an opinion about the market. `evidence_type` is the rung the
  *action* stands on, not the rung of what was said in it: having had eleven
  conversations is `observed_behavior`; what those eleven people said they
  would pay is `stated_opinion`. `incurred_cost` is money or time already
  spent — by the founder or by a customer. `source` and `date` when the
  founder gives them, null otherwise. Never infer an entry the founder did not
  claim: `model_inference` has no place in this array.

## Founder context — who is asking

- `founder_context.unfair_advantages[]` — what this founder brings that a
  newcomer to the segment does not, in their own words, one entry each ("ran
  dental procurement for four years"). A credential is not an advantage
  unless it is an advantage *for this segment*.
- `founder_context.background` — where the founder has been, in one line.

## Facets — the match spine

Vocabulary values only. `one_liner` ≤ 140 characters, neutral, third person.
Free-text facets (`industry`, `object`, `context`, `geography`) are lowercase,
singular, no adjectives, the customer's domain not the founder's technology
("dental practice", not "AI for dentists"). `keywords` are 3–8 lowercase noun
phrases. `founder_intent` may be empty until the founder says what they want
the card for.
