import { isDeepStrictEqual } from "node:util";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { person, session, thesisCard } from "@/db/schema";
import { curatedResources, ideaNeeds, resourceRecommendations } from "@/db/resource-schema";
import { NeedInput, NeedUpdate, validateResource } from "./validation";
import { matchResource } from "./matching";
import { assertActiveMember, lockActiveMembership } from "@/pilot/membership";
import { pilotMembership } from "@/db/pilot-schema";
import { createCard, personOfSession } from "@/db/cards";

export async function createResearchIdea(db: Db, sessionId: string, input: unknown) {
  const value = NeedInput.omit({ cardId: true }).extend({ idea: z.string().trim().min(1).max(2000) }).parse(input);
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as Db;
    const personId = await personOfSession(tx, sessionId);
    if (!personId) throw new Error("Sign in to save an idea.");
    await lockActiveMembership(tx, personId);
    const card = await createCard(tx, { sessionId, door: "blank", ideaText: value.idea });
    const need = await createNeed(tx, personId, { cardId: card.id, title: value.title, criteria: value.criteria, monitoring: value.monitoring });
    return { card, need };
  });
}

export function isCuratorEmail(email: string): boolean {
  const allowed = (process.env.RESOURCE_CURATOR_EMAILS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

export async function assertCurator(db: Db, personId: string) {
  await assertActiveMember(db, personId);
  const [actor] = await db.select().from(person).where(eq(person.id, z.uuid().parse(personId))).limit(1);
  if (!actor || !isCuratorEmail(actor.email)) throw new Error("Curator access required");
  return actor;
}

async function ownedCard(db: Db, personId: string, cardId: string) {
  const [row] = await db.select({ id: thesisCard.id }).from(thesisCard)
    .innerJoin(session, eq(session.id, thesisCard.sessionId))
    .where(and(eq(thesisCard.id, z.uuid().parse(cardId)), eq(session.personId, personId))).limit(1);
  if (!row) throw new Error("Idea owner access required");
}

export async function createNeed(db: Db, personId: string, input: unknown) {
  const value = NeedInput.parse(input);
  await assertActiveMember(db, personId);
  await ownedCard(db, personId, value.cardId);
  const [row] = await db.insert(ideaNeeds).values({ ...value, personId }).returning();
  return row;
}

export async function updateNeed(db: Db, personId: string, needId: string, input: unknown) {
  const value = NeedUpdate.parse(input);
  await assertActiveMember(db, personId);
  const [row] = await db.update(ideaNeeds).set({ ...value, revision: sql`${ideaNeeds.revision} + 1`, updatedAt: new Date() })
    .where(and(eq(ideaNeeds.id, z.uuid().parse(needId)), eq(ideaNeeds.personId, personId))).returning();
  if (!row) throw new Error("Need owner access required");
  return row;
}

export async function importResource(db: Db, personId: string, input: unknown) {
  await assertCurator(db, personId);
  const value = validateResource(input);
  const [inserted] = await db.insert(curatedResources).values({ ...value, curatorId: personId })
    .onConflictDoNothing({ target: [curatedResources.sourceUrl, curatedResources.textHash] }).returning();
  if (inserted) return inserted;
  const [existing] = await db.select().from(curatedResources)
    .where(and(eq(curatedResources.sourceUrl, value.sourceUrl), eq(curatedResources.textHash, value.textHash))).limit(1);
  return existing;
}

const MAX_RESOURCES = 1000;
const MAX_NEEDS = 1000;

export type RefreshCommitGuard = {
  beforeNeed?: (completed: number) => void | Promise<void>;
  authorize: (tx: Db, now: Date) => Promise<void>;
  record: (tx: Db, progress: { resources: number; checked: number; created: number; updated: number }, now: Date) => Promise<void>;
  now: () => Date;
};

export async function refreshResources(db: Db, options: { personId?: string; run?: RefreshCommitGuard } = {}) {
  if (options.personId) await assertActiveMember(db, options.personId);
  const resources = await db.select().from(curatedResources).orderBy(curatedResources.id).limit(MAX_RESOURCES + 1);
  const pending = await db.select({ id: ideaNeeds.id }).from(ideaNeeds)
    .innerJoin(pilotMembership, and(
      eq(pilotMembership.personId, ideaNeeds.personId),
      eq(pilotMembership.status, "active"),
      isNull(pilotMembership.revokedAt),
    ))
    .where(and(eq(ideaNeeds.status, "active"), eq(ideaNeeds.monitoring, true), options.personId ? eq(ideaNeeds.personId, options.personId) : undefined))
    .orderBy(ideaNeeds.id).limit(MAX_NEEDS + 1);
  if (resources.length > MAX_RESOURCES || pending.length > MAX_NEEDS) {
    throw new Error("Pilot refresh limit exceeded (1000 resources or active needs). Narrow the corpus before refreshing.");
  }
  const summary = { checked: 0, resources: resources.length, created: 0, updated: 0 };
  for (const item of pending) {
    await options.run?.beforeNeed?.(summary.checked);
    const result = await db.transaction(async (tx) => {
      const now = options.run?.now() ?? new Date();
      if (options.run) await options.run.authorize(tx as unknown as Db, now);
      // Lock the need so a concurrent pause or edit cannot publish stale alerts.
      const [need] = await tx.select().from(ideaNeeds).where(eq(ideaNeeds.id, item.id)).for("update");
      if (!need || need.status !== "active" || !need.monitoring) return null;
      await lockActiveMembership(tx as unknown as Db, need.personId);
      const existing = await tx.select().from(resourceRecommendations).where(eq(resourceRecommendations.needId, need.id));
      const seen = new Map(existing.map((row) => [row.resourceId, row]));
      let created = 0;
      let updated = 0;
      const candidates = resources.map((resource) => ({ resource, match: matchResource(need, resource) }))
        .filter((entry) => entry.match !== null)
        .sort((a, b) => b.match!.score - a.match!.score || a.resource.id.localeCompare(b.resource.id)).slice(0, 5);
      for (const { resource, match } of candidates) {
        const previous = seen.get(resource.id);
        if (previous?.needRevision === need.revision && isDeepStrictEqual(previous.explanation, match!.explanation)) continue;
        if (previous) {
          await tx.update(resourceRecommendations).set({ needRevision: need.revision, score: match!.score, explanation: match!.explanation, updatedAt: now })
            .where(eq(resourceRecommendations.id, previous.id));
          updated++;
        } else {
          const rows = await tx.insert(resourceRecommendations).values({ needId: need.id, resourceId: resource.id, needRevision: need.revision, score: match!.score, explanation: match!.explanation })
            .onConflictDoNothing({ target: [resourceRecommendations.needId, resourceRecommendations.resourceId] }).returning({ id: resourceRecommendations.id });
          created += rows.length;
        }
      }
      await tx.update(ideaNeeds).set({ lastCheckedAt: now }).where(eq(ideaNeeds.id, need.id));
      if (options.run) await options.run.record(tx as unknown as Db, {
        resources: resources.length, checked: 1, created, updated,
      }, now);
      return { created, updated };
    });
    if (result) { summary.checked++; summary.created += result.created; summary.updated += result.updated; }
  }
  return summary;
}

export async function listResourcesForPerson(db: Db, personId: string) {
  const needs = await db.select().from(ideaNeeds).where(eq(ideaNeeds.personId, personId)).orderBy(desc(ideaNeeds.createdAt));
  const recommendations = await db.select({ recommendation: resourceRecommendations, need: ideaNeeds, resource: curatedResources })
    .from(resourceRecommendations).innerJoin(ideaNeeds, eq(ideaNeeds.id, resourceRecommendations.needId))
    .innerJoin(curatedResources, eq(curatedResources.id, resourceRecommendations.resourceId))
    .where(and(eq(ideaNeeds.personId, personId), eq(ideaNeeds.status, "active"), eq(ideaNeeds.monitoring, true), eq(resourceRecommendations.needRevision, ideaNeeds.revision)))
    .orderBy(desc(resourceRecommendations.createdAt));
  const unread = recommendations.filter(({ recommendation }) => !recommendation.readAt && !recommendation.outcome).length;
  return { needs, recommendations, unread };
}

async function ownedRecommendation(db: Db, personId: string, recommendationId: string) {
  const [row] = await db.select({ id: resourceRecommendations.id }).from(resourceRecommendations)
    .innerJoin(ideaNeeds, eq(ideaNeeds.id, resourceRecommendations.needId))
    .where(and(eq(resourceRecommendations.id, z.uuid().parse(recommendationId)), eq(ideaNeeds.personId, personId))).limit(1);
  if (!row) throw new Error("Recommendation owner access required");
  return row.id;
}

export async function recordOutcome(db: Db, personId: string, recommendationId: string, outcome: unknown, note: unknown = "") {
  await assertActiveMember(db, personId);
  const id = await ownedRecommendation(db, personId, recommendationId);
  const value = z.enum(["dismissed", "helped", "not_helpful"]).parse(outcome);
  const text = z.string().trim().max(2000).parse(note);
  if (value === "helped" && !text) throw new Error("Add your next action before marking this suggestion as helped.");
  await db.update(resourceRecommendations).set({ outcome: value, outcomeNote: text || null, outcomeAt: new Date(), readAt: new Date() })
    .where(eq(resourceRecommendations.id, id));
}

export async function markRead(db: Db, personId: string, recommendationId: string) {
  await assertActiveMember(db, personId);
  const id = await ownedRecommendation(db, personId, recommendationId);
  await db.update(resourceRecommendations).set({ readAt: new Date() })
    .where(and(eq(resourceRecommendations.id, id), isNull(resourceRecommendations.readAt)));
}
