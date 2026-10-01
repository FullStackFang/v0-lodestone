import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Db } from "@/db/client";
import { applyPatch, fieldsOf } from "@/db/cards";
import { person, session, thesisCard } from "@/db/schema";
import { cardRevision, cardReview, ideaExperiment, type CardRevisionRow, type IdeaExperimentRow } from "@/db/review-schema";
import { CardFields, CardPatch, EMPTY_FIELDS, EvidenceType, type Evidence } from "@/schema/card";
import { assertActiveMember, isActiveMember, lockActiveMembership } from "@/pilot/membership";

export const REVIEW_COMPONENTS = {
  offering: "Offering", segment: "Customer segment", value_proposition: "Customer value",
  jtbd: "Job to be done", economic_buyer: "Economic buyer", beachhead: "Beachhead market",
  four_us: "Problem urgency", rubric_scores: "Assessment", kill_assumption: "Critical assumption",
  facets: "Business model", evidence: "Evidence",
} as const;
export type ReviewComponent = keyof typeof REVIEW_COMPONENTS;
export const ReviewComponent = z.enum(Object.keys(REVIEW_COMPONENTS) as [ReviewComponent, ...ReviewComponent[]]);
export const ReviewKind = z.enum(["challenge", "evidence", "test", "help"]);
export const Disposition = z.enum(["addressed", "deferred", "disagreed"]);
export const Visibility = z.enum(["unlisted", "cohort"]);
const words = z.string().trim().min(1).max(12_000);

export async function ownedIdea(db: Db, personId: string, cardId: string) {
  const [row] = await db.select({ card: thesisCard }).from(thesisCard)
    .innerJoin(session, eq(thesisCard.sessionId, session.id))
    .where(and(eq(thesisCard.id, cardId), eq(session.personId, personId))).limit(1);
  if (!row) throw new Error("not your idea");
  return row.card;
}

export async function ideasForOwner(db: Db, personId: string) {
  return db.select({ card: thesisCard }).from(thesisCard)
    .innerJoin(session, eq(thesisCard.sessionId, session.id))
    .where(eq(session.personId, personId)).orderBy(desc(thesisCard.updatedAt));
}

export async function saveIdea(db: Db, personId: string, cardId: string, patch: unknown) {
  const valid = CardPatch.omit({ founder_context: true }).parse(patch);
  await assertActiveMember(db, personId);
  const card = await ownedIdea(db, personId, cardId);
  return applyPatch(db, card, valid);
}

/** Explicit publication allowlist. Raw intake can itself be a resume. */
export function publicFields(fields: CardFields, approvedEvidence: Evidence[] = []): CardFields {
  return CardFields.parse({
    ...EMPTY_FIELDS, offering: fields.offering, segment: fields.segment,
    value_proposition: fields.value_proposition, jtbd: fields.jtbd,
    economic_buyer: fields.economic_buyer, beachhead: fields.beachhead,
    four_us: fields.four_us, rubric_scores: fields.rubric_scores,
    kill_assumption: fields.kill_assumption, facets: fields.facets ? { ...fields.facets, founder_intent: [] } : null,
    evidence: approvedEvidence.map((e) => ({ ...e, source: null })),
  });
}

export function experimentEvidence(experiments: IdeaExperimentRow[]): Evidence[] {
  return experiments.filter((e) => e.status === "complete" && e.shareResult && e.result && e.evidenceType)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((e) => ({ text: e.result!, evidence_type: e.evidenceType!, source: null, date: e.updatedAt.toISOString().slice(0, 10) }));
}

export function publicationFingerprint(fields: CardFields) {
  return createHash("sha256").update(JSON.stringify(CardFields.parse(fields))).digest("hex");
}

export async function publishRevision(db: Db, personId: string, cardId: string, visibility: unknown, expectedPreview?: string): Promise<CardRevisionRow> {
  const audience = Visibility.parse(visibility);
  return db.transaction(async (tx) => {
    await lockActiveMembership(tx as unknown as Db, personId);
    const card = await ownedIdea(tx as unknown as Db, personId, cardId);
    const [locked] = await tx.select().from(thesisCard).where(eq(thesisCard.id, card.id)).for("update");
    if (!locked.offering?.trim()) throw new Error("Add an offering before publishing.");
    const [{ highest }] = await tx.select({ highest: sql<number>`coalesce(max(${cardRevision.version}), 0)::int` })
      .from(cardRevision).where(eq(cardRevision.cardId, cardId));
    const experiments = await tx.select().from(ideaExperiment).where(eq(ideaExperiment.cardId, cardId));
    const fields = publicFields(fieldsOf(locked), experimentEvidence(experiments));
    if (expectedPreview !== undefined && publicationFingerprint(fields) !== expectedPreview) {
      throw new Error("The draft or approved evidence changed. Refresh the preview before publishing.");
    }
    const [row] = await tx.insert(cardRevision).values({ cardId, ownerId: personId, version: highest + 1,
      fields, visibility: audience }).returning();
    return row;
  });
}

export function canReadRevision(revision: CardRevisionRow, viewerId: string | null) {
  return revision.revokedAt === null && (revision.visibility === "unlisted" || viewerId !== null);
}

export async function readPublication(db: Db, slug: string, viewerId: string | null, version?: number) {
  if (version !== undefined && (!Number.isSafeInteger(version) || version < 1)) return null;
  const [row] = await db.select({ revision: cardRevision, slug: thesisCard.slug }).from(cardRevision)
    .innerJoin(thesisCard, eq(cardRevision.cardId, thesisCard.id))
    .where(and(eq(thesisCard.slug, slug), version === undefined ? undefined : eq(cardRevision.version, version)))
    .orderBy(desc(cardRevision.version)).limit(1);
  if (!row || !canReadRevision(row.revision, viewerId)) return null;
  if (row.revision.visibility === "unlisted") return row;
  if (!viewerId) return null;
  const [viewerActive, ownerActive] = await Promise.all([
    isActiveMember(db, viewerId),
    isActiveMember(db, row.revision.ownerId),
  ]);
  return viewerActive && ownerActive ? row : null;
}

export async function revisionsForOwner(db: Db, personId: string, cardId: string) {
  await ownedIdea(db, personId, cardId);
  return db.select().from(cardRevision).where(eq(cardRevision.cardId, cardId)).orderBy(desc(cardRevision.version));
}

export async function revokeRevision(db: Db, personId: string, revisionId: string) {
  const [revision] = await db.select().from(cardRevision).where(eq(cardRevision.id, revisionId)).limit(1);
  if (!revision) throw new Error("publication unavailable");
  await ownedIdea(db, personId, revision.cardId);
  await db.update(cardRevision).set({ revokedAt: new Date() }).where(eq(cardRevision.id, revisionId));
}

export async function addReview(db: Db, reviewerId: string, revisionId: string, input: unknown) {
  const value = z.object({ component: ReviewComponent, kind: ReviewKind, text: words }).strict().parse(input);
  await assertActiveMember(db, reviewerId);
  const [revision] = await db.select().from(cardRevision).where(eq(cardRevision.id, revisionId)).limit(1);
  if (!revision || !canReadRevision(revision, reviewerId) ||
    revision.visibility === "cohort" && !(await isActiveMember(db, revision.ownerId))) {
    throw new Error("publication unavailable");
  }
  const [reviewer] = await db.select({ id: person.id }).from(person).where(eq(person.id, reviewerId)).limit(1);
  if (!reviewer) throw new Error("sign in to review");
  if (revision.ownerId === reviewerId) throw new Error("Use an author response for your own idea.");
  const [row] = await db.insert(cardReview).values({ revisionId, reviewerId, ...value }).returning();
  return row;
}

export async function reviewsForRevision(db: Db, revisionId: string, viewerId: string | null) {
  const [revision] = await db.select().from(cardRevision).where(eq(cardRevision.id, revisionId)).limit(1);
  if (!revision || (revision.ownerId !== viewerId && !canReadRevision(revision, viewerId))) return [];
  const rows = await db.select({ review: cardReview, reviewerName: person.name }).from(cardReview)
    .innerJoin(person, eq(cardReview.reviewerId, person.id)).where(eq(cardReview.revisionId, revisionId)).orderBy(asc(cardReview.createdAt));
  return rows.map(({ review, reviewerName }) => ({ ...review, reviewerName }));
}

export async function respondToReview(db: Db, personId: string, reviewId: string, input: unknown) {
  const value = z.object({ disposition: Disposition, response: words }).strict().parse(input);
  await assertActiveMember(db, personId);
  const [row] = await db.select({ review: cardReview, revision: cardRevision }).from(cardReview)
    .innerJoin(cardRevision, eq(cardReview.revisionId, cardRevision.id)).where(eq(cardReview.id, reviewId)).limit(1);
  if (!row) throw new Error("review unavailable");
  await ownedIdea(db, personId, row.revision.cardId);
  await db.update(cardReview).set({ ...value, respondedAt: new Date() }).where(eq(cardReview.id, reviewId));
}

export async function reviewsForOwner(db: Db, personId: string, cardId: string) {
  const revisions = await revisionsForOwner(db, personId, cardId);
  if (!revisions.length) return [];
  const rows = await db.select({ review: cardReview, reviewerName: person.name, version: cardRevision.version }).from(cardReview)
    .innerJoin(person, eq(cardReview.reviewerId, person.id)).innerJoin(cardRevision, eq(cardReview.revisionId, cardRevision.id))
    .where(inArray(cardReview.revisionId, revisions.map((r) => r.id))).orderBy(desc(cardReview.createdAt));
  return rows.map(({ review, reviewerName, version }) => ({ ...review, reviewerName, version }));
}

export async function createExperiment(db: Db, personId: string, cardId: string, input: unknown) {
  const value = z.object({ hypothesis: words, method: words, criterion: words, revisionId: z.uuid().nullable() }).strict().parse(input);
  await assertActiveMember(db, personId);
  await ownedIdea(db, personId, cardId);
  if (value.revisionId) {
    const [revision] = await db.select().from(cardRevision).where(and(eq(cardRevision.id, value.revisionId), eq(cardRevision.cardId, cardId))).limit(1);
    if (!revision) throw new Error("revision does not belong to this idea");
  }
  const [row] = await db.insert(ideaExperiment).values({ ...value, cardId, ownerId: personId }).returning();
  return row;
}

export async function updateExperiment(db: Db, personId: string, experimentId: string, input: unknown) {
  const value = z.object({ status: z.enum(["planned", "running", "complete"]), result: z.string().trim().max(12_000).nullable(), evidenceType: EvidenceType.nullable(), shareResult: z.boolean() }).strict()
    .refine((v) => v.status !== "complete" || Boolean(v.result && v.evidenceType), "A completed experiment needs a result and an evidence classification.").parse(input);
  await assertActiveMember(db, personId);
  const [row] = await db.select().from(ideaExperiment).where(eq(ideaExperiment.id, experimentId)).limit(1);
  if (!row) throw new Error("experiment unavailable");
  await ownedIdea(db, personId, row.cardId);
  await db.update(ideaExperiment).set({ ...value, updatedAt: new Date() }).where(eq(ideaExperiment.id, experimentId));
}

export async function experimentsForOwner(db: Db, personId: string, cardId: string) {
  await ownedIdea(db, personId, cardId);
  return db.select().from(ideaExperiment).where(eq(ideaExperiment.cardId, cardId)).orderBy(desc(ideaExperiment.createdAt));
}
