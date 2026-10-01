import { describe, expect, it } from "vitest";
import { EMPTY_FIELDS, RUBRIC_FACTORS, type CardFields } from "@/schema/card";
import { deriveStage, gates, isVague, statusFor } from "./gates";

const segment = (over: Partial<NonNullable<CardFields["segment"]>> = {}): CardFields["segment"] => ({
  description: "owner-dentists at single-location US practices",
  findability_evidence: null,
  homogeneity_claim: null,
  size_estimate: null,
  four_question_test: null,
  refinement: null,
  ...over,
});

const thesisPassing: CardFields = {
  ...EMPTY_FIELDS,
  idea_text: "DentalKeep",
  offering: "a $349/mo SaaS that fills cancelled slots from an SMS waitlist",
  segment: segment(),
  value_proposition: "recovers ~$2,800/mo in no-show revenue",
};

const fourYes = { list_100_prospects: "yes", share_top_need: "yes", one_gtm_reaches: "yes", can_afford: "yes" } as const;

const rubric = Object.fromEntries(
  RUBRIC_FACTORS.map((k) => [k, { score: 3, confidence: "low", rationale: "r", evidence_type: "model_inference" }]),
) as NonNullable<CardFields["rubric_scores"]>;

const throughBuyer: CardFields = {
  ...thesisPassing,
  segment: segment({ four_question_test: fourYes }),
  jtbd: {
    job_statement: "fill the schedule",
    functional: null,
    emotional: null,
    social: null,
    current_workaround: "front desk calls the waitlist by hand",
    passes_member_test: true,
  },
  economic_buyer: { role: "owner-dentist", distinct_from_end_user: true, budget_evidence: "already pays $300/mo for reminder texts" },
};

const complete: CardFields = {
  ...throughBuyer,
  rubric_scores: rubric,
  kill_assumption: {
    assumption: "practices lose ≥10% of booked revenue to no-shows",
    falsifiable: true,
    cheapest_test: { description: "pull 10 practices' schedules", days: 7, kill_criterion: "median no-show < 5%" },
  },
};

describe("isVague", () => {
  it("flags the laundering phrases", () => {
    expect(isVague("small businesses")).toBe(true);
    expect(isVague("an AI-powered platform for everyone")).toBe(true);
    expect(isVague("helps people save time")).toBe(true);
  });
  it("passes anything with a real noun", () => {
    expect(isVague("owner-dentists")).toBe(false);
    expect(isVague("solo bookkeepers serving 1–5 clients")).toBe(false);
    expect(isVague("an app for applying to grants")).toBe(false);
  });
});

describe("thesis gate", () => {
  it("fails a vague segment and names the field", () => {
    const v = gates.thesis({ ...thesisPassing, segment: segment({ description: "small businesses" }) });
    expect(v.pass).toBe(false);
    expect(v.reason).toMatch(/^segment\.description/);
  });
  it("passes the dental thesis", () => {
    expect(gates.thesis(thesisPassing).pass).toBe(true);
  });
});

describe("segment gate", () => {
  it("passes four yes", () => {
    expect(gates.segment({ ...thesisPassing, segment: segment({ four_question_test: fourYes }) }).pass).toBe(true);
  });
  it("fails three yes and a maybe without a refinement", () => {
    const t = { ...fourYes, can_afford: "maybe" as const };
    expect(gates.segment({ ...thesisPassing, segment: segment({ four_question_test: t }) }).pass).toBe(false);
  });
  it("passes three yes and a maybe with a refinement", () => {
    const t = { ...fourYes, can_afford: "maybe" as const };
    expect(gates.segment({ ...thesisPassing, segment: segment({ four_question_test: t, refinement: "practices with ≥2 chairs" }) }).pass).toBe(true);
  });
  it("fails two maybe regardless", () => {
    const t = { ...fourYes, can_afford: "maybe" as const, one_gtm_reaches: "maybe" as const };
    expect(gates.segment({ ...thesisPassing, segment: segment({ four_question_test: t, refinement: "x" }) }).pass).toBe(false);
  });
});

describe("buyer gate", () => {
  it("passes a named buyer with budget evidence", () => {
    expect(gates.buyer(throughBuyer).pass).toBe(true);
  });
  it("passes an explicitly unknown buyer with the end-user question answered", () => {
    expect(gates.buyer({ ...throughBuyer, economic_buyer: { role: "unknown", distinct_from_end_user: true, budget_evidence: null } }).pass).toBe(true);
  });
  it("fails a named buyer with no budget evidence", () => {
    expect(gates.buyer({ ...throughBuyer, economic_buyer: { role: "hospital admin", distinct_from_end_user: true, budget_evidence: null } }).pass).toBe(false);
  });
});

describe("rubric gate", () => {
  it("fails on seven factors", () => {
    const { whole_product: _, ...seven } = rubric;
    expect(gates.rubric({ ...throughBuyer, rubric_scores: seven as never }).pass).toBe(false);
  });
  it("passes on eight", () => {
    expect(gates.rubric({ ...throughBuyer, rubric_scores: rubric }).pass).toBe(true);
  });
});

describe("kill gate", () => {
  it("passes a 7-day falsifiable test", () => {
    expect(gates.kill(complete).pass).toBe(true);
  });
  it("fails a 21-day test and names the bound", () => {
    const k = { ...complete.kill_assumption!, cheapest_test: { ...complete.kill_assumption!.cheapest_test!, days: 21 } };
    const v = gates.kill({ ...complete, kill_assumption: k });
    expect(v.pass).toBe(false);
    expect(v.reason).toMatch(/two weeks/);
  });
  it("fails an unfalsifiable assumption", () => {
    expect(gates.kill({ ...complete, kill_assumption: { ...complete.kill_assumption!, falsifiable: false } }).pass).toBe(false);
  });
});

describe("deriveStage / statusFor", () => {
  it("walks the data", () => {
    expect(deriveStage(EMPTY_FIELDS)).toBe("intake");
    expect(deriveStage({ ...EMPTY_FIELDS, idea_text: "x" })).toBe("thesis");
    expect(deriveStage(thesisPassing)).toBe("segment");
    expect(deriveStage(throughBuyer)).toBe("rubric");
    expect(deriveStage({ ...throughBuyer, rubric_scores: rubric })).toBe("kill");
    expect(deriveStage(complete)).toBe("render");
  });
  it("render passes only when everything does", () => {
    expect(gates.render(throughBuyer).pass).toBe(false);
    expect(gates.render(complete).pass).toBe(true);
  });
  it("status follows the gates", () => {
    expect(statusFor(EMPTY_FIELDS)).toBe("draft");
    expect(statusFor(thesisPassing)).toBe("gated");
    expect(statusFor(complete)).toBe("complete");
  });
});
