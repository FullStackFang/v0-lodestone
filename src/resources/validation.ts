import { z } from "zod";
import { hashText, normalize } from "@/harness/canonical";
import { anchor } from "@/harness/extract/anchor";
import type { ResourceClaim } from "@/db/resource-schema";

export const CLAIM_FACETS = ["purpose", "method", "result", "conditions", "limitations", "equipment", "access"] as const;
const bounded = (max: number) => z.string().trim().min(1).max(max);
const ResourceInput = z.object({
  kind: z.enum(["paper", "patent", "technology_disclosure"]),
  title: bounded(300),
  sourceUrl: z.url().max(2000).refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }, "Source URL must use HTTPS without credentials"),
  identifier: bounded(300),
  sourceDate: z.iso.date(),
  rawText: z.string().min(1).max(60000).refine((value) => value.trim().length > 0, "Source text is required"),
  claims: z.array(z.object({
    facet: z.enum(CLAIM_FACETS), text: bounded(1500), quote: bounded(2000), prefix: z.string().max(200).default(""),
  }).strict()).min(1).max(30),
  proposals: z.array(bounded(1000)).max(10).default([]),
}).strict();

export function validateResource(input: unknown) {
  const parsed = ResourceInput.parse(input);
  const canonicalText = normalize(parsed.rawText);
  const claims: ResourceClaim[] = parsed.claims.map((claim) => {
    const placed = anchor(canonicalText, normalize(claim.quote), normalize(claim.prefix));
    if (!placed.ok) throw new Error(`Cannot anchor ${claim.facet} quote: ${placed.reason}`);
    return { facet: claim.facet, text: claim.text, quote: canonicalText.slice(placed.start, placed.end), startOff: placed.start, endOff: placed.end };
  });
  if (!claims.some((claim) => claim.facet === "purpose" || claim.facet === "method")) {
    throw new Error("A source needs a quoted purpose or method");
  }
  return { ...parsed, sourceUrl: new URL(parsed.sourceUrl).href, canonicalText, textHash: hashText(canonicalText), claims };
}

export const NeedInput = z.object({
  cardId: z.uuid(), title: bounded(200), criteria: bounded(2000), monitoring: z.boolean().default(true),
}).strict();
export const NeedUpdate = NeedInput.omit({ cardId: true }).extend({ status: z.enum(["active", "paused", "resolved"]) });
