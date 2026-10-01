import { z } from "zod";
import { BusinessModel, BuyerRole, IndustryGroup, OfferingType, OrgSize, Quadrant, RUBRIC_FACTORS, CardPatch, type CardFields } from "@/schema/card";

export const EDITOR_GROUPS = ["thesis", "segment", "jtbd", "buyer", "four_us", "rubric", "kill", "facets"] as const;
export const EditorGroup = z.enum(EDITOR_GROUPS);
export type EditorGroup = z.infer<typeof EditorGroup>;
export type EditorField = { name: string; label: string; value: string; options?: readonly string[]; numeric?: boolean; multiline?: boolean };
export type EditorSection = { id: EditorGroup; title: string; fields: EditorField[] };
const text = (v: unknown) => v === null || v === undefined ? "" : String(v);
const title = (v: string) => v.replaceAll("_", " ");

export function editorSections(f: CardFields): EditorSection[] {
  const field = (name: string, label: string, value: unknown, extra: Partial<EditorField> = {}): EditorField => ({ name, label, value: text(value), ...extra });
  return [
    { id: "thesis", title: "Thesis", fields: [field("offering", "Offering", f.offering, { multiline: true }), field("value_proposition", "Customer value", f.value_proposition, { multiline: true })] },
    { id: "segment", title: "Customer segment", fields: [
      field("description", "Who has this problem", f.segment?.description, { multiline: true }),
      field("findability_evidence", "Where you can reach them", f.segment?.findability_evidence),
      field("homogeneity_claim", "Shared need", f.segment?.homogeneity_claim),
      field("size_estimate", "Segment size and basis", f.segment?.size_estimate),
      ...(["list_100_prospects", "share_top_need", "one_gtm_reaches", "can_afford"] as const).map((k) => field(k, title(k), f.segment?.four_question_test?.[k], { options: ["yes", "maybe", "no"] })),
      field("refinement", "Segment refinement", f.segment?.refinement),
    ] },
    { id: "jtbd", title: "Job to be done", fields: [
      ...(["job_statement", "functional", "emotional", "social", "current_workaround"] as const).map((k) => field(k, title(k), f.jtbd?.[k], { multiline: true })),
      field("passes_member_test", "Would a segment member recognize this value?", f.jtbd?.passes_member_test, { options: ["true", "false"] }),
    ] },
    { id: "buyer", title: "Buyer and beachhead", fields: [
      field("role", "Who pays", f.economic_buyer?.role),
      field("distinct_from_end_user", "Buyer differs from the user", f.economic_buyer?.distinct_from_end_user, { options: ["true", "false"] }),
      field("budget_evidence", "Budget evidence", f.economic_buyer?.budget_evidence, { multiline: true }),
      field("market", "First market", f.beachhead?.market), field("why_first", "Why this market first", f.beachhead?.why_first),
      field("adjacent_markets", "Adjacent markets, one per line", f.beachhead?.adjacent_markets.join("\n"), { multiline: true }),
    ] },
    { id: "four_us", title: "Problem urgency", fields: (["unworkable", "unavoidable", "urgent", "underserved"] as const).flatMap((k) => [
      field(`${k}_answer`, title(k), f.four_us?.[k].answer, { options: ["true", "false"] }),
      field(`${k}_rationale`, `${title(k)} rationale`, f.four_us?.[k].rationale),
    ]) },
    { id: "rubric", title: "Assessment", fields: RUBRIC_FACTORS.flatMap((k) => [
      field(`${k}_score`, `${title(k)} score (1-5)`, f.rubric_scores?.[k].score, { numeric: true }),
      field(`${k}_confidence`, "Confidence", f.rubric_scores?.[k].confidence ?? "low", { options: ["low", "med", "high"] }),
      field(`${k}_rationale`, `${title(k)} rationale`, f.rubric_scores?.[k].rationale, { multiline: true }),
      field(`${k}_evidence_type`, "Evidence basis", f.rubric_scores?.[k].evidence_type ?? "model_inference", { options: ["observed_behavior", "incurred_cost", "stated_opinion", "model_inference"] }),
    ]) },
    { id: "kill", title: "Critical assumption", fields: [
      field("assumption", "What could invalidate the idea", f.kill_assumption?.assumption, { multiline: true }),
      field("falsifiable", "A result could disprove this", f.kill_assumption?.falsifiable, { options: ["true", "false"] }),
      field("description", "Cheapest test", f.kill_assumption?.cheapest_test?.description, { multiline: true }),
      field("days", "Days needed", f.kill_assumption?.cheapest_test?.days, { numeric: true }),
      field("kill_criterion", "Result that would invalidate it", f.kill_assumption?.cheapest_test?.kill_criterion, { multiline: true }),
    ] },
    { id: "facets", title: "Business model", fields: [
      field("one_liner", "One-line summary", f.facets?.one_liner),
      field("offering_type", "Offering type", f.facets?.offering_type, { options: OfferingType.options }),
      field("business_model", "Revenue model", f.facets?.business_model, { options: BusinessModel.options }),
      field("industry", "Industry", f.facets?.segment.industry),
      field("industry_group", "Industry group", f.facets?.segment.industry_group, { options: IndustryGroup.options }),
      field("buyer_role", "Buyer role", f.facets?.segment.buyer_role, { options: BuyerRole.options }),
      field("org_size", "Customer organization size", f.facets?.segment.org_size, { options: OrgSize.options }),
      field("geography", "Geography", f.facets?.segment.geography),
      field("quadrant", "Value category", f.facets?.quadrant, { options: Quadrant.options }),
      field("keywords", "Keywords, one per line", f.facets?.keywords.join("\n"), { multiline: true }),
    ] },
  ];
}

export function groupPatch(fields: CardFields, group: unknown, data: FormData) {
  const g = EditorGroup.parse(group);
  const read = (key: string) => String(data.get(key) ?? "").trim() || null;
  const bool = (key: string) => read(key) === null ? null : z.enum(["true", "false"]).parse(read(key)) === "true";
  const list = (key: string) => (read(key) ?? "").split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
  const number = (key: string) => read(key) === null ? null : Number(read(key));
  let patch: unknown;
  switch (g) {
    case "thesis": patch = { offering: read("offering"), value_proposition: read("value_proposition") }; break;
    case "segment": {
      const test = { list_100_prospects: read("list_100_prospects"), share_top_need: read("share_top_need"), one_gtm_reaches: read("one_gtm_reaches"), can_afford: read("can_afford") };
      if (Object.values(test).some(Boolean) && Object.values(test).some((v) => !v)) throw new Error("Answer all four segment checks, or leave all four unknown.");
      patch = { segment: { description: read("description"), findability_evidence: read("findability_evidence"), homogeneity_claim: read("homogeneity_claim"), size_estimate: read("size_estimate"), refinement: read("refinement"), four_question_test: Object.values(test).some(Boolean) ? test : null } }; break;
    }
    case "jtbd": patch = { jtbd: { job_statement: read("job_statement"), functional: read("functional"), emotional: read("emotional"), social: read("social"), current_workaround: read("current_workaround"), passes_member_test: bool("passes_member_test") } }; break;
    case "buyer": patch = { economic_buyer: { role: read("role"), distinct_from_end_user: bool("distinct_from_end_user"), budget_evidence: read("budget_evidence") }, beachhead: { market: read("market"), why_first: read("why_first"), adjacent_markets: list("adjacent_markets") } }; break;
    case "four_us": patch = { four_us: Object.fromEntries(["unworkable", "unavoidable", "urgent", "underserved"].map((k) => [k, { answer: bool(`${k}_answer`), rationale: read(`${k}_rationale`) }])) }; break;
    case "rubric": patch = { rubric_scores: Object.fromEntries(RUBRIC_FACTORS.map((k) => [k, { score: number(`${k}_score`), confidence: read(`${k}_confidence`), rationale: read(`${k}_rationale`), evidence_type: read(`${k}_evidence_type`) }])) }; break;
    case "kill": patch = { kill_assumption: { assumption: read("assumption"), falsifiable: bool("falsifiable"), cheapest_test: { description: read("description"), days: number("days"), kill_criterion: read("kill_criterion") } } }; break;
    case "facets": patch = { facets: { one_liner: read("one_liner"), offering_type: read("offering_type"), business_model: read("business_model"), segment: { industry: read("industry"), industry_group: read("industry_group"), buyer_role: read("buyer_role"), org_size: read("org_size"), geography: read("geography") }, jtbd: fields.facets?.jtbd ?? { verb: null, object: null, context: null }, quadrant: read("quadrant"), founder_intent: fields.facets?.founder_intent ?? [], keywords: list("keywords") } }; break;
  }
  return CardPatch.parse(patch);
}
