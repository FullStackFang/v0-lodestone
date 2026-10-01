import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { fieldsOf } from "@/db/cards";
import { cardRevision } from "@/db/review-schema";
import { assertions, thesisCard } from "@/db/schema";
import { savePreferences } from "./preferences";
import { enrollTestMember } from "@/pilot/test-fixtures";

/** Explicit cohort consent in synthetic fixtures, never a production default. */
export async function publishFixture(db: Db, ownerId: string, cardId: string) {
  await enrollTestMember(db, ownerId);
  await savePreferences(db, ownerId, { discoverable: true, availability: "part_time", intent: "cofounder" });
  const [card] = await db.select().from(thesisCard).where(eq(thesisCard.id, cardId));
  const rows = await db.select().from(assertions).where(and(eq(assertions.subjectId, cardId), eq(assertions.status, "active")));
  const purposes = rows.filter((r) => r.facet === "purpose" && r.abstractionLevel === "specific");
  const abstract = rows.find((r) => r.facet === "purpose" && r.abstractionLevel === "abstract")?.text ?? null;
  const domain = rows.find((r) => r.facet === "domain")?.text ?? null;
  const [previous] = await db.select().from(cardRevision).where(eq(cardRevision.cardId, cardId)).orderBy(desc(cardRevision.version)).limit(1);
  await db.insert(cardRevision).values({ cardId, ownerId, version: (previous?.version ?? 0) + 1, visibility: "cohort", fields: {
    ...fieldsOf(card), idea_text: purposes[0]?.text ?? null, value_proposition: purposes[1]?.text ?? null,
    jtbd: abstract ? { job_statement: abstract, functional: null, emotional: null, social: null, current_workaround: null, passes_member_test: null } : null,
    segment: domain ? { description: domain, findability_evidence: null, homogeneity_claim: null, size_estimate: null, four_question_test: null, refinement: null } : null,
  } });
}
