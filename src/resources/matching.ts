import type { ResourceClaim, ResourceExplanation } from "@/db/resource-schema";

const STOP_WORDS = new Set("the and for with from this that into have needs need using used use can our their which about will would should could purpose method result".split(" "));
function terms(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((word) => word.length > 2 && !STOP_WORDS.has(word)));
}

export function matchResource(
  need: { title: string; criteria: string },
  resource: { title: string; claims: ResourceClaim[] },
): { score: number; explanation: ResourceExplanation } | null {
  const query = terms(`${need.title} ${need.criteria}`);
  const evidence = resource.claims.filter((claim) => ["purpose", "method", "result"].includes(claim.facet));
  const supported = terms(evidence.map((claim) => claim.quote).join(" "));
  const matchedTerms = [...query].filter((word) => supported.has(word)).sort();
  if (matchedTerms.length < 2 || query.size === 0) return null;
  const snippets = evidence.filter((claim) => [...terms(claim.quote)].some((term) => matchedTerms.includes(term))).slice(0, 3);
  const applicability = resource.claims.filter((claim) => ["conditions", "equipment", "access"].includes(claim.facet)).map((claim) => `${claim.facet}: ${claim.quote}`);
  const limitations = resource.claims.filter((claim) => claim.facet === "limitations").map((claim) => claim.quote);
  return {
    score: matchedTerms.length / query.size,
    explanation: {
      matchedTerms, snippets,
      explanation: `Shared source terms: ${matchedTerms.join(", ")}. Applicability has not been verified.`,
      applicability: applicability.length ? applicability : ["Conditions, equipment and access have not been stated."],
      limitations: limitations.length ? limitations : ["Limitations have not been stated."],
      nextAction: "Compare the source's conditions and limitations with your acceptance criteria before trying the method.",
    },
  };
}
