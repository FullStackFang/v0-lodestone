import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { AVAILABILITIES, MATCHING_INTENTS, founderPreferences } from "@/db/matching-schema";
import { cardRevision } from "@/db/review-schema";
import { assertions, type AssertionRow } from "@/db/schema";
import { canvasAssertions } from "./canvas";
import { assertActiveMember, isActiveMember, membershipFor } from "@/pilot/membership";

export const PreferenceInput = z.object({
  discoverable: z.boolean(),
  availability: z.enum(AVAILABILITIES),
  intent: z.enum(MATCHING_INTENTS),
}).strict();
export type PreferenceInput = z.infer<typeof PreferenceInput>;
export const PRIVATE_PREFERENCES: PreferenceInput = {
  discoverable: false, availability: "unavailable", intent: "cofounder",
};

export async function preferencesFor(db: Db, personId: string): Promise<PreferenceInput> {
  const [row] = await db.select().from(founderPreferences).where(eq(founderPreferences.personId, personId));
  return row ? PreferenceInput.parse({ discoverable: row.discoverable, availability: row.availability, intent: row.intent }) : { ...PRIVATE_PREFERENCES };
}

export async function savePreferences(db: Db, personId: string, input: PreferenceInput): Promise<void> {
  const value = PreferenceInput.parse(input);
  if (value.discoverable) await assertActiveMember(db, personId);
  await db.insert(founderPreferences).values({ personId, ...value }).onConflictDoUpdate({
    target: founderPreferences.personId, set: { ...value, updatedAt: new Date() },
  });
}

export function compatiblePreferences(a: PreferenceInput, b: PreferenceInput): boolean {
  return a.discoverable && b.discoverable && a.intent === b.intent &&
    a.availability !== "unavailable" && b.availability !== "unavailable" &&
    (a.availability === b.availability || a.availability === "exploring" || b.availability === "exploring");
}

export async function compatiblePair(db: Db, a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const [mine, theirs, mineActive, theirsActive] = await Promise.all([
    preferencesFor(db, a),
    preferencesFor(db, b),
    isActiveMember(db, a),
    isActiveMember(db, b),
  ]);
  if (!mineActive || !theirsActive) return false;
  return compatiblePreferences(mine, theirs);
}

/** The publication boundary also applies to cached explanations and model input. */
export async function matchingRows(db: Db, personId: string): Promise<AssertionRow[]> {
  if (!(await isActiveMember(db, personId))) return [];
  if (!(await preferencesFor(db, personId)).discoverable) return [];
  const revisions = await db.select().from(cardRevision).where(eq(cardRevision.ownerId, personId))
    .orderBy(desc(cardRevision.version));
  const latest = new Map<string, typeof revisions[number]>();
  for (const revision of revisions) if (!latest.has(revision.cardId)) latest.set(revision.cardId, revision);
  const published = [...latest.values()].filter((r) => r.visibility === "cohort" && !r.revokedAt);
  const people = await db.select().from(assertions).where(and(
    eq(assertions.subjectType, "person"), eq(assertions.subjectId, personId),
    eq(assertions.status, "active"), ne(assertions.text, "not_stated"),
  ));
  if (!published.length) return people;
  const history = await db.select().from(assertions).where(and(
    eq(assertions.subjectType, "idea"), inArray(assertions.subjectId, published.map((r) => r.cardId)),
    ne(assertions.text, "not_stated"),
  )).orderBy(asc(assertions.createdAt), asc(assertions.id));
  const projected: AssertionRow[] = [];
  const usedIds = new Set<string>();
  for (const revision of published) {
    const fields = new Map(canvasAssertions(revision.fields, null)
      .filter((a) => a.subjectType === "idea" && a.text !== "not_stated").map((a) => [a.field, a]));
    for (const expected of fields.values()) {
      const candidates = history.filter((r) => r.subjectId === revision.cardId && r.facet === expected.facet &&
        r.abstractionLevel === expected.abstractionLevel && r.text === expected.text);
      const historical = candidates.find((r) => (r.provenance as Record<string, unknown>).field === expected.field) ?? candidates[0];
      const hex = createHash("sha256").update(`${revision.id}:${expected.field}`).digest("hex").slice(0, 32);
      const virtualId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      const id = historical && !usedIds.has(historical.id) ? historical.id : virtualId;
      usedIds.add(id);
      // Only vector data is reusable. The snapshot owns every displayed fact
      // and its metadata, including when a private edit superseded the source.
      projected.push({ id, subjectType: "idea", subjectId: revision.cardId,
        facet: expected.facet, abstractionLevel: expected.abstractionLevel, text: expected.text,
        embedding: historical?.embedding ?? null, embeddingModel: historical?.embeddingModel ?? null,
        sourceType: "canvas", sourceArtifactId: revision.id, textHash: null,
        startOff: null, endOff: null, quote: null, prefix: null, suffix: null,
        provenance: { kind: "canvas", card_id: revision.cardId, field: expected.field,
          patch_event_id: revision.id, publication_id: revision.id, ...(expected.extra ?? {}) },
        extractionRunId: null, confidence: "extracted", evidenceType: expected.evidenceType,
        status: "active", supersededBy: null, createdAt: revision.createdAt,
      });
    }
  }
  return [...people, ...projected];
}

/** Old harness results have a different hash and cannot expose private drafts. */
export async function matchingStateHash(db: Db, a: string, b: string): Promise<string> {
  const sides = await Promise.all([a, b].map(async (id) => ({
    id, preferences: await preferencesFor(db, id),
    membership: await membershipFor(db, id),
    rows: (await matchingRows(db, id)).map((r) => JSON.stringify([
      r.id, (r.provenance as Record<string, unknown>).publication_id ?? null,
      r.facet, r.abstractionLevel, r.text, r.evidenceType,
    ])).sort(),
  })));
  return createHash("sha256").update(JSON.stringify({ policy: "published-opt-in-membership/3", sides })).digest("hex");
}
