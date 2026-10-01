import { describe, expect, it } from "vitest";
import { EMPTY_FIELDS } from "@/schema/card";
import { groupPatch } from "./editor";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("methodology editing", () => {
  it("changes only the submitted methodology group", () => {
    expect(groupPatch(EMPTY_FIELDS, "thesis", form({ offering: " An SMS waitlist ", value_proposition: "Restore cancelled revenue", founder_context: "forged" }))).toEqual({ offering: "An SMS waitlist", value_proposition: "Restore cancelled revenue" });
  });

  it("rejects a partial segmentation test without destroying unknown values", () => {
    expect(() => groupPatch(EMPTY_FIELDS, "segment", form({ list_100_prospects: "yes" }))).toThrow("all four");
    expect(groupPatch(EMPTY_FIELDS, "segment", form({ description: "Independent dental practices" })).segment?.four_question_test).toBeNull();
  });

  it("rejects invalid numeric and boolean test fields", () => {
    expect(() => groupPatch(EMPTY_FIELDS, "kill", form({ days: "soon" }))).toThrow();
    expect(() => groupPatch(EMPTY_FIELDS, "kill", form({ days: "-1" }))).toThrow();
    expect(() => groupPatch(EMPTY_FIELDS, "kill", form({ days: "3", falsifiable: "maybe" }))).toThrow();
  });

  it("keeps matching intent and job taxonomy when editing business facets", () => {
    const facets = { one_liner: null, offering_type: null, business_model: null, segment: { industry: null, industry_group: null, buyer_role: null, org_size: null, geography: null }, jtbd: { verb: "reduce" as const, object: "empty appointments", context: "independent practices" }, quadrant: null, founder_intent: ["seeking_feedback" as const], keywords: [] };
    const patch = groupPatch({ ...EMPTY_FIELDS, facets }, "facets", form({ offering_type: "saas", business_model: "subscription" }));
    expect(patch.facets).toMatchObject({ jtbd: facets.jtbd, founder_intent: facets.founder_intent, offering_type: "saas", business_model: "subscription" });
  });
});
