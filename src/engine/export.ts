/** The card as one machine-readable document. Deterministic — the same row
 *  renders the same bytes — and led by a `format` stamp so a consumer can
 *  version against it. Internal ids stay home: the slug is the identity. */
import type { ThesisCardRow } from "@/db/schema";
import { fieldsOf } from "@/db/cards";
import { deriveStage, verdicts } from "./gates";
import { STAGES } from "./stages";

export const EXPORT_FORMAT = "thesis-card/1";

export function exportCard(card: ThesisCardRow): string {
  const fields = fieldsOf(card);
  const v = verdicts(fields);
  const doc = {
    format: EXPORT_FORMAT,
    slug: card.slug,
    status: card.status,
    stage: deriveStage(fields),
    gates: Object.fromEntries(STAGES.map((s) => [s, v[s].pass])),
    created_at: card.createdAt.toISOString(),
    updated_at: card.updatedAt.toISOString(),
    provenance: card.provenance,
    ...fields,
  };
  return JSON.stringify(doc, null, 2) + "\n";
}
