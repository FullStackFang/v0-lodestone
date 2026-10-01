import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, type Db } from "@/db/client";
import { applyPatch, createCard, createSession, getCard } from "@/db/cards";
import { cardRevision, ideaExperiment } from "@/db/review-schema";
import { ensurePerson } from "@/harness/ledger";
import { publishRevision, readPublication, revokeRevision, saveIdea, addReview, respondToReview, reviewsForRevision, createExperiment, updateExperiment } from "./revisions";
import { enrollTestMember } from "@/pilot/test-fixtures";

let db: Db;
let ownerId: string;
let peerId: string;
let ownerSession: string;

beforeAll(async () => {
  db = await createPgliteDb();
  ownerId = await ensurePerson(db, { name: "Owner", email: "revision-owner@example.edu" });
  peerId = await ensurePerson(db, { name: "Peer", email: "revision-peer@example.edu" });
  await enrollTestMember(db, ownerId);
  await enrollTestMember(db, peerId);
  ownerSession = await createSession(db, ownerId);
});

async function idea() {
  const card = await createCard(db, { sessionId: ownerSession, door: "resume", ideaText: "PRIVATE RESUME" });
  return applyPatch(db, card, { offering: "SMS cancellation waitlist", founder_context: { background: "PRIVATE BIO", unfair_advantages: ["PRIVATE CONTACT"] }, evidence: [{ text: "PRIVATE INTERVIEW", evidence_type: "stated_opinion", source: "PRIVATE SOURCE", date: null }] });
}

describe("published revisions", () => {
  it("refuses publication when the preview fingerprint no longer matches", async () => {
    const card = await idea();
    await expect(publishRevision(db, ownerId, card.id, "unlisted", "an-outdated-preview")).rejects.toThrow("preview");
    expect(await readPublication(db, card.slug, null)).toBeNull();
  });

  it("the database refuses a completed experiment without a result", async () => {
    const card = await idea();
    await expect(db.insert(ideaExperiment).values({ cardId: card.id, ownerId, hypothesis: "A test", method: "Pilot", criterion: "Two deposits", status: "complete", result: null, evidenceType: "observed_behavior" })).rejects.toThrow();
  });

  it("stores immutable numbered snapshots without private intake, profile or raw evidence", async () => {
    const card = await idea();
    const first = await publishRevision(db, ownerId, card.id, "unlisted");
    await saveIdea(db, ownerId, card.id, { offering: "A revised product" });
    const second = await publishRevision(db, ownerId, card.id, "unlisted");
    const publicOne = await readPublication(db, card.slug, null, first.version);
    expect(publicOne?.revision.fields.offering).toBe("SMS cancellation waitlist");
    expect(JSON.stringify(publicOne?.revision.fields)).not.toContain("PRIVATE");
    expect(second.version).toBe(first.version + 1);
    expect((await readPublication(db, card.slug, null))?.revision.id).toBe(second.id);
  });

  it("requires the owner for publication and editing and respects cohort and revoked reads", async () => {
    const card = await idea();
    await expect(publishRevision(db, peerId, card.id, "cohort")).rejects.toThrow("not your idea");
    await expect(saveIdea(db, peerId, card.id, { offering: "forged" })).rejects.toThrow("not your idea");
    expect(await readPublication(db, card.slug, null)).toBeNull();
    const revision = await publishRevision(db, ownerId, card.id, "cohort");
    expect(await readPublication(db, card.slug, null)).toBeNull();
    expect((await readPublication(db, card.slug, peerId))?.revision.id).toBe(revision.id);
    await expect(revokeRevision(db, peerId, revision.id)).rejects.toThrow("not your idea");
    await revokeRevision(db, ownerId, revision.id);
    expect(await readPublication(db, card.slug, peerId, revision.version)).toBeNull();
    expect((await db.select().from(cardRevision).where(eq(cardRevision.id, revision.id)))[0].revokedAt).not.toBeNull();
  });

  it("pins a review to the exact revision and allows only the owner to respond", async () => {
    const card = await idea();
    const first = await publishRevision(db, ownerId, card.id, "unlisted");
    const review = await addReview(db, peerId, first.id, { component: "segment", kind: "challenge", text: "Who actually pays?" });
    await saveIdea(db, ownerId, card.id, { offering: "A new offering" });
    const second = await publishRevision(db, ownerId, card.id, "unlisted");
    expect(await reviewsForRevision(db, second.id, ownerId)).toEqual([]);
    await expect(respondToReview(db, peerId, review.id, { disposition: "addressed", response: "fake response" })).rejects.toThrow("not your idea");
    await respondToReview(db, ownerId, review.id, { disposition: "deferred", response: "We will interview the buyer next." });
    const [saved] = await reviewsForRevision(db, first.id, ownerId);
    expect(saved).toMatchObject({ revisionId: first.id, text: "Who actually pays?", disposition: "deferred", response: "We will interview the buyer next." });
    await expect(addReview(db, peerId, first.id, { component: "not-a-component", kind: "challenge", text: "invalid" })).rejects.toThrow();
    await revokeRevision(db, ownerId, first.id);
    await expect(addReview(db, peerId, first.id, { component: "segment", kind: "challenge", text: "too late" })).rejects.toThrow("publication unavailable");
  });

  it("requires outcomes to complete experiments and shares only explicitly approved results", async () => {
    const card = await idea();
    const experiment = await createExperiment(db, ownerId, card.id, { hypothesis: "Dentists pay for recovered appointments", method: "Offer a paid pilot to five practices", criterion: "At least two paid deposits", revisionId: null });
    await expect(updateExperiment(db, ownerId, experiment.id, { status: "complete", result: "", evidenceType: null, shareResult: true })).rejects.toThrow();
    expect((await db.select().from(ideaExperiment).where(eq(ideaExperiment.id, experiment.id)))[0].status).toBe("planned");
    await expect(updateExperiment(db, peerId, experiment.id, { status: "running", result: null, evidenceType: null, shareResult: false })).rejects.toThrow("not your idea");
    await updateExperiment(db, ownerId, experiment.id, { status: "complete", result: "Two practices paid a deposit", evidenceType: "observed_behavior", shareResult: false });
    const first = await publishRevision(db, ownerId, card.id, "unlisted");
    expect(first.fields.evidence).toEqual([]);
    await updateExperiment(db, ownerId, experiment.id, { status: "complete", result: "Two practices paid a deposit", evidenceType: "observed_behavior", shareResult: true });
    const second = await publishRevision(db, ownerId, card.id, "unlisted");
    expect(second.fields.evidence).toEqual([expect.objectContaining({ text: "Two practices paid a deposit", evidence_type: "observed_behavior", source: null })]);
    expect((await getCard(db, card.id))?.evidence?.[0].text).toBe("PRIVATE INTERVIEW");
  });
});
