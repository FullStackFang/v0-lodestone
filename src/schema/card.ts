/** The Business Thesis Card — the labeled-data contract.
 *
 * Every jsonb column on `thesis_card` is one of these objects, and nothing
 * writes one that has not passed its schema. String members are nullable so a
 * partially drafted group is storable: the model files what the pitch
 * supports and the gates decide what is enough.
 *
 * `strict()` everywhere: a creative field name from the model is a bug the
 * database must not absorb.
 */
import { z } from "zod";

const text = z.string().nullable();

// ---------------------------------------------------------------------------
// Methodology groups
// ---------------------------------------------------------------------------

export const YesMaybeNo = z.enum(["yes", "maybe", "no"]);

/** The four-question segmentation test (Aulet's index-card test). */
export const FourQuestionTest = z
  .object({
    list_100_prospects: YesMaybeNo,
    share_top_need: YesMaybeNo,
    one_gtm_reaches: YesMaybeNo,
    can_afford: YesMaybeNo,
  })
  .strict();

export const Segment = z
  .object({
    description: text,
    findability_evidence: text,
    homogeneity_claim: text,
    size_estimate: text,
    four_question_test: FourQuestionTest.nullable(),
    refinement: text,
  })
  .strict();

export const Jtbd = z
  .object({
    job_statement: text,
    functional: text,
    emotional: text,
    social: text,
    current_workaround: text,
    /** Would a segment member say yes or no to the value proposition? The
     *  model asserts; the gate requires true. */
    passes_member_test: z.boolean().nullable(),
  })
  .strict();

export const EconomicBuyer = z
  .object({
    role: text,
    distinct_from_end_user: z.boolean().nullable(),
    budget_evidence: text,
  })
  .strict();

export const Beachhead = z
  .object({
    market: text,
    why_first: text,
    adjacent_markets: z.array(z.string()),
  })
  .strict();

const U = z.object({ answer: z.boolean().nullable(), rationale: text }).strict();

export const FourUs = z
  .object({ unworkable: U, unavoidable: U, urgent: U, underserved: U })
  .strict();

export const RUBRIC_FACTORS = [
  "market_size",
  "cost_to_launch",
  "value_prop_clarity",
  "margins",
  "competitive_advantage",
  "problem_magnitude",
  "whole_product",
  "team_market_fit",
] as const;
export const RubricFactor = z.enum(RUBRIC_FACTORS);

/** Evidence ladder, strongest first. The prompt tags which rung a score
 *  stands on; a thin card is `model_inference` by construction. The tuple is
 *  exported because the harness derives a Postgres enum from it. */
export const EVIDENCE_TYPES = [
  "observed_behavior",
  "incurred_cost",
  "stated_opinion",
  "model_inference",
] as const;
export const EvidenceType = z.enum(EVIDENCE_TYPES);

export const RubricScore = z
  .object({
    score: z.number().int().min(1).max(5),
    confidence: z.enum(["low", "med", "high"]),
    rationale: z.string().min(1),
    evidence_type: EvidenceType,
  })
  .strict();

/** All eight, always. A missing factor fails validation — that is the
 *  "never skip a factor" rule as a type rather than an instruction. */
export const RubricScores = z
  .object(
    Object.fromEntries(RUBRIC_FACTORS.map((k) => [k, RubricScore])) as Record<
      (typeof RUBRIC_FACTORS)[number],
      typeof RubricScore
    >,
  )
  .strict();

export const CheapestTest = z
  .object({
    description: text,
    days: z.number().int().min(0).nullable(),
    kill_criterion: text,
  })
  .strict();

export const KillAssumption = z
  .object({
    assumption: text,
    falsifiable: z.boolean().nullable(),
    cheapest_test: CheapestTest.nullable(),
  })
  .strict();

/** What the founder has *done*, on the same ladder the rubric scores stand
 *  on. Restored from the v0.2 pack by the harness contract: purpose and
 *  mechanism describe a founder and neither records an action. */
export const Evidence = z
  .object({
    text: z.string().min(1),
    evidence_type: EvidenceType,
    source: text,
    date: text,
  })
  .strict();

export const FounderContext = z
  .object({
    background: text,
    unfair_advantages: z.array(z.string()),
  })
  .strict();

export const Door = z.enum(["blank", "deck", "resume"]);
export const ProvenanceSource = z.enum(["chat", "paper", "deck", "resume"]);

export const Provenance = z
  .object({
    source: ProvenanceSource,
    doc_id: z.string().nullable(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Facets — the match spine (card-schema.md v0.2, verbatim vocabularies)
// ---------------------------------------------------------------------------

export const OfferingType = z.enum([
  "saas",
  "marketplace",
  "service",
  "hardware",
  "consumer_app",
  "api_infra",
  "content_media",
  "community",
  "dtc_product",
]);

export const BusinessModel = z.enum([
  "subscription",
  "transaction_fee",
  "usage_based",
  "licensing",
  "services_fees",
  "advertising",
  "resale_margin",
  "freemium_upsell",
]);

export const IndustryGroup = z.enum([
  "healthcare",
  "financial_services",
  "education",
  "real_estate_construction",
  "food_beverage",
  "retail_ecommerce",
  "manufacturing_logistics",
  "media_entertainment",
  "energy_climate",
  "government_nonprofit",
  "professional_services",
  "consumer_lifestyle",
  "technology",
]);

export const BuyerRole = z.enum([
  "owner_founder",
  "exec",
  "functional_manager",
  "procurement",
  "individual_consumer",
  "household",
  "institution_admin",
]);

export const OrgSize = z.enum([
  "solo",
  "smb",
  "mid_market",
  "enterprise",
  "institution",
  "consumer_na",
]);

export const JtbdVerb = z.enum([
  "reduce",
  "increase",
  "avoid",
  "comply",
  "find",
  "connect",
  "automate",
  "decide",
  "learn",
  "sell",
  "buy",
  "hire",
  "retain",
  "create",
  "maintain",
]);

export const Quadrant = z.enum(["painkiller", "vitamin", "jet_fuel", "candy"]);

export const FounderIntent = z.enum([
  "seeking_cofounder",
  "seeking_feedback",
  "seeking_customers",
  "seeking_pilot",
  "seeking_capital",
  "exploring",
]);

export const Facets = z
  .object({
    one_liner: text,
    offering_type: OfferingType.nullable(),
    business_model: BusinessModel.nullable(),
    segment: z
      .object({
        industry: text,
        industry_group: IndustryGroup.nullable(),
        buyer_role: BuyerRole.nullable(),
        org_size: OrgSize.nullable(),
        geography: text,
      })
      .strict(),
    jtbd: z
      .object({ verb: JtbdVerb.nullable(), object: text, context: text })
      .strict(),
    quadrant: Quadrant.nullable(),
    founder_intent: z.array(FounderIntent),
    keywords: z.array(z.string()),
  })
  .strict();

// ---------------------------------------------------------------------------
// The card's methodology fields, whole and as a patch
// ---------------------------------------------------------------------------

/** Every field the model can fill. Each group is nullable as a whole (the
 *  column is null until first touched) and its members are nullable within. */
export const CardFields = z
  .object({
    idea_text: text,
    offering: text,
    segment: Segment.nullable(),
    value_proposition: text,
    jtbd: Jtbd.nullable(),
    economic_buyer: EconomicBuyer.nullable(),
    beachhead: Beachhead.nullable(),
    four_us: FourUs.nullable(),
    rubric_scores: RubricScores.nullable(),
    kill_assumption: KillAssumption.nullable(),
    facets: Facets.nullable(),
    evidence: z.array(Evidence).nullish(),
    founder_context: FounderContext.nullish(),
  })
  .strict();

export type CardFields = z.infer<typeof CardFields>;
export type Evidence = z.infer<typeof Evidence>;
export type EvidenceType = z.infer<typeof EvidenceType>;
export type FounderContext = z.infer<typeof FounderContext>;
export type Segment = z.infer<typeof Segment>;
export type FourQuestionTest = z.infer<typeof FourQuestionTest>;
export type Jtbd = z.infer<typeof Jtbd>;
export type EconomicBuyer = z.infer<typeof EconomicBuyer>;
export type Beachhead = z.infer<typeof Beachhead>;
export type FourUs = z.infer<typeof FourUs>;
export type RubricScores = z.infer<typeof RubricScores>;
export type RubricScore = z.infer<typeof RubricScore>;
export type RubricFactor = z.infer<typeof RubricFactor>;
export type KillAssumption = z.infer<typeof KillAssumption>;
export type Provenance = z.infer<typeof Provenance>;
export type Facets = z.infer<typeof Facets>;
export type Door = z.infer<typeof Door>;

/** What one turn may change. Top-level keys are optional; a present group
 *  is a full, valid group (the model rewrites a group, it does not diff it).
 *  `rubric_scores` in particular is all-eight-or-nothing. */
export const CardPatch = CardFields.partial();
export type CardPatch = z.infer<typeof CardPatch>;

export const EMPTY_FIELDS: CardFields = {
  idea_text: null,
  offering: null,
  segment: null,
  value_proposition: null,
  jtbd: null,
  economic_buyer: null,
  beachhead: null,
  four_us: null,
  rubric_scores: null,
  kill_assumption: null,
  facets: null,
  evidence: null,
  founder_context: null,
};

/** Apply a validated patch. A key present in the patch replaces the field;
 *  a key absent leaves it. Pure — returns a new object. */
export function mergePatch(fields: CardFields, patch: CardPatch): CardFields {
  const next = { ...fields };
  for (const key of Object.keys(patch) as (keyof CardPatch)[]) {
    const value = patch[key];
    if (value !== undefined) (next as Record<string, unknown>)[key] = value;
  }
  return next;
}
