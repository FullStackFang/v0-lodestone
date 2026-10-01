import { describe, expect, it } from "vitest";
import {
  CardFields,
  CardPatch,
  EMPTY_FIELDS,
  Evidence,
  Facets,
  FounderContext,
  RUBRIC_FACTORS,
  RubricScores,
  Segment,
  mergePatch,
} from "./card";

const fullRubric = Object.fromEntries(
  RUBRIC_FACTORS.map((k) => [
    k,
    { score: 3, confidence: "low", rationale: "guess", evidence_type: "model_inference" },
  ]),
);

describe("RubricScores", () => {
  it("accepts all eight factors", () => {
    expect(RubricScores.safeParse(fullRubric).success).toBe(true);
  });

  it("rejects a missing factor", () => {
    const { whole_product: _dropped, ...seven } = fullRubric;
    expect(RubricScores.safeParse(seven).success).toBe(false);
  });

  it("rejects a creative factor name", () => {
    expect(RubricScores.safeParse({ ...fullRubric, team_fit: fullRubric.margins }).success).toBe(false);
  });

  it("rejects a score outside 1–5 and an empty rationale", () => {
    expect(RubricScores.safeParse({ ...fullRubric, margins: { ...fullRubric.margins, score: 6 } }).success).toBe(false);
    expect(RubricScores.safeParse({ ...fullRubric, margins: { ...fullRubric.margins, rationale: "" } }).success).toBe(false);
  });
});

describe("Facets", () => {
  const facets = {
    one_liner: "x",
    offering_type: "saas",
    business_model: null,
    segment: { industry: null, industry_group: null, buyer_role: null, org_size: null, geography: null },
    jtbd: { verb: null, object: null, context: null },
    quadrant: "painkiller",
    founder_intent: [],
    keywords: [],
  };

  it("accepts vocabulary values", () => {
    expect(Facets.safeParse(facets).success).toBe(true);
  });

  it("rejects a value outside the vocabulary", () => {
    expect(Facets.safeParse({ ...facets, quadrant: "aspirin" }).success).toBe(false);
  });
});

describe("Segment", () => {
  it("stores a partial group", () => {
    const r = Segment.safeParse({
      description: "owner-dentists",
      findability_evidence: null,
      homogeneity_claim: null,
      size_estimate: null,
      four_question_test: null,
      refinement: null,
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown member", () => {
    const r = Segment.safeParse({
      description: "x",
      findability_evidence: null,
      homogeneity_claim: null,
      size_estimate: null,
      four_question_test: null,
      refinement: null,
      vibe: "good",
    });
    expect(r.success).toBe(false);
  });
});

describe("CardPatch + mergePatch", () => {
  it("replaces present keys and leaves absent ones", () => {
    const patch = CardPatch.parse({ offering: "a tool" });
    const next = mergePatch({ ...EMPTY_FIELDS, value_proposition: "keep" }, patch);
    expect(next.offering).toBe("a tool");
    expect(next.value_proposition).toBe("keep");
  });

  it("rejects an unknown top-level key", () => {
    expect(CardPatch.safeParse({ offerings: "x" }).success).toBe(false);
  });
});

describe("evidence and founder_context", () => {
  it("parse when present", () => {
    const fields = CardFields.parse({
      ...EMPTY_FIELDS,
      evidence: [
        { text: "talked to eleven dentists", evidence_type: "observed_behavior", source: null, date: null },
      ],
      founder_context: { background: "ten years in dental ops", unfair_advantages: ["the roster"] },
    });
    expect(fields.evidence?.[0].evidence_type).toBe("observed_behavior");
    expect(fields.founder_context?.unfair_advantages).toEqual(["the roster"]);
  });

  it("are optional — a card without them is still valid", () => {
    const { evidence: _e, founder_context: _f, ...without } = EMPTY_FIELDS;
    expect(CardFields.safeParse(without).success).toBe(true);
    expect(CardFields.parse(EMPTY_FIELDS).evidence).toBeNull();
  });

  it("reject an evidence type off the ladder and a context without advantages", () => {
    expect(Evidence.safeParse({ text: "x", evidence_type: "hearsay" }).success).toBe(false);
    expect(FounderContext.safeParse({ background: null }).success).toBe(false);
  });
});
