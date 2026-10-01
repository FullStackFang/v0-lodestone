import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { founderIntroductions } from "@/db/matching-schema";
import { judgments, matchResults } from "@/db/schema";
import { ensurePerson, insertAssertion } from "@/harness/ledger";
import { introductionContact, introductionsFor, dismiss, pendingFollowUps, recordFollowUp, requestIntroduction, respondIntroduction } from "./intro";
import { matchesFor, meView } from "./me";
import { matchingStateHash, savePreferences } from "./preferences";
import { revokeMembership, type VerifiedPilotActor } from "@/pilot/membership";
import { enrollTestMember } from "@/pilot/test-fixtures";

let db: Db;
beforeEach(async () => { db = await createPgliteDb(); });
afterEach(() => { vi.unstubAllGlobals(); });

async function founder(name: string) {
  const personId = await ensurePerson(db, { name, email: `${name}@intro.edu` });
  await enrollTestMember(db, personId);
  await savePreferences(db, personId, { discoverable: true, availability: "part_time", intent: "cofounder" });
  const fact = await insertAssertion(db, { subjectType: "person", subjectId: personId,
    facet: "mechanism_commanded", text: `${name}'s stated capability`, sourceType: "subject_edit", confidence: "confirmed",
    provenance: { kind: "subject_edit", person_id: personId } as never });
  return { personId, assertionId: fact.id };
}

async function pilotOperator(): Promise<VerifiedPilotActor> {
  vi.stubEnv("PILOT_OPERATOR_EMAILS", "operator@intro.edu");
  return {
    personId: await ensurePerson(db, { name: "operator", email: "operator@intro.edu" }),
    email: "operator@intro.edu",
    emailVerified: true,
  };
}

async function result(reader: Awaited<ReturnType<typeof founder>>, candidate: Awaited<ReturnType<typeof founder>>) {
  const [row] = await db.insert(matchResults).values({
    edgeType: "cofounder", querySubjectType: "person", querySubjectId: reader.personId,
    candidateSubjectId: candidate.personId, score: 0.61, rank: 0,
    components: { contributors: { mechanism: { query: reader.assertionId, candidate: candidate.assertionId } } } as never,
    assertionSetHash: await matchingStateHash(db, reader.personId, candidate.personId),
  }).returning();
  return row;
}

async function pair() {
  const maya = await founder("maya");
  const omar = await founder("omar");
  return { maya, omar, row: await result(maya, omar) };
}

describe("mutual introductions", () => {
  it("records a pending request without sending email or exposing contacts", async () => {
    const { maya, omar, row } = await pair();
    const send = vi.fn();
    vi.stubGlobal("fetch", send);
    const { introduction, judgment } = await requestIntroduction(db, row.id, maya.personId);
    expect(introduction.status).toBe("pending");
    expect(judgment.verdict).toBe("requested");
    expect(judgment.queryAssertionId).toBe(maya.assertionId);
    expect(send).not.toHaveBeenCalled();
    expect(await introductionContact(db, introduction.id, maya.personId)).toBeNull();
    expect(await introductionContact(db, introduction.id, omar.personId)).toBeNull();
    const incoming = await introductionsFor(db, omar.personId);
    expect(incoming[0]).toMatchObject({ mine: false, otherName: "maya", contact: null });
    expect(JSON.stringify(incoming)).not.toContain("@intro.edu");
    const [shown] = await db.select().from(matchResults).where(eq(matchResults.id, row.id));
    expect(shown.shownAt).not.toBeNull();
  });

  it("reveals contacts only after the recipient accepts", async () => {
    const { maya, omar, row } = await pair();
    const { introduction } = await requestIntroduction(db, row.id, maya.personId);
    await expect(respondIntroduction(db, introduction.id, maya.personId, "accepted")).rejects.toThrow(/recipient/);
    await respondIntroduction(db, introduction.id, omar.personId, "accepted");
    expect(await introductionContact(db, introduction.id, maya.personId)).toEqual({ name: "omar", email: "omar@intro.edu" });
    expect(await introductionContact(db, introduction.id, omar.personId)).toEqual({ name: "maya", email: "maya@intro.edu" });
    const stranger = await founder("stranger");
    await expect(introductionContact(db, introduction.id, stranger.personId)).rejects.toThrow(/Not your/);
    await expect(respondIntroduction(db, introduction.id, stranger.personId, "accepted")).rejects.toThrow(/recipient/);
  });

  it("keeps declined contacts private and makes request and response replays idempotent", async () => {
    const { maya, omar, row } = await pair();
    const first = await requestIntroduction(db, row.id, maya.personId);
    const repeat = await requestIntroduction(db, row.id, maya.personId);
    expect(repeat.introduction.id).toBe(first.introduction.id);
    expect(await db.select().from(judgments)).toHaveLength(1);
    await respondIntroduction(db, first.introduction.id, omar.personId, "declined");
    await respondIntroduction(db, first.introduction.id, omar.personId, "declined");
    expect(await introductionContact(db, first.introduction.id, maya.personId)).toBeNull();
    await expect(respondIntroduction(db, first.introduction.id, omar.personId, "accepted")).rejects.toThrow(/different response/);
    expect((await requestIntroduction(db, row.id, maya.personId)).introduction.status).toBe("declined");
  });

  it("does not interpret a reciprocal request as consent", async () => {
    const { maya, omar, row } = await pair();
    const first = await requestIntroduction(db, row.id, maya.personId);
    const reverse = await result(omar, maya);
    const reciprocal = await requestIntroduction(db, reverse.id, omar.personId);
    expect(reciprocal.introduction.id).toBe(first.introduction.id);
    expect(reciprocal.introduction.status).toBe("pending");
    expect(await db.select().from(judgments)).toHaveLength(1);
  });

  it("refuses other people's match actions before side effects", async () => {
    const { omar, row } = await pair();
    await expect(requestIntroduction(db, row.id, omar.personId)).rejects.toThrow(/Not your/);
    await expect(dismiss(db, row.id, omar.personId)).rejects.toThrow(/Not your/);
    await expect(recordFollowUp(db, row.id, omar.personId, "helped")).rejects.toThrow(/Not your/);
    expect(await db.select().from(founderIntroductions)).toEqual([]);
    expect(await db.select().from(judgments)).toEqual([]);
  });

  it("rechecks consent before a request or acceptance", async () => {
    const { maya, omar, row } = await pair();
    await savePreferences(db, omar.personId, { discoverable: false, availability: "part_time", intent: "cofounder" });
    await expect(requestIntroduction(db, row.id, maya.personId)).rejects.toThrow(/opt in/);
    await savePreferences(db, omar.personId, { discoverable: true, availability: "part_time", intent: "cofounder" });
    const { introduction } = await requestIntroduction(db, row.id, maya.personId);
    await savePreferences(db, maya.personId, { discoverable: false, availability: "part_time", intent: "cofounder" });
    await expect(respondIntroduction(db, introduction.id, omar.personId, "accepted")).rejects.toThrow(/opt in/);
  });

  it("asks follow-ups only for accepted introductions and records one outcome", async () => {
    const { maya, omar, row } = await pair();
    const { introduction } = await requestIntroduction(db, row.id, maya.personId);
    expect(await pendingFollowUps(db, 0)).toEqual([]);
    await expect(recordFollowUp(db, row.id, maya.personId, "helped")).rejects.toThrow(/accepted/);
    await respondIntroduction(db, introduction.id, omar.personId, "accepted");
    await db.update(founderIntroductions).set({ respondedAt: new Date(Date.now() - 8 * 86400000) }).where(eq(founderIntroductions.id, introduction.id));
    expect(await pendingFollowUps(db)).toHaveLength(1);
    expect((await meView(db, maya.personId)).followUps).toHaveLength(1);
    const one = await recordFollowUp(db, row.id, maya.personId, "helped");
    expect((await recordFollowUp(db, row.id, maya.personId, "helped")).id).toBe(one.id);
    await expect(recordFollowUp(db, row.id, maya.personId, "not_helpful")).rejects.toThrow(/different response/);
    expect(await pendingFollowUps(db)).toEqual([]);
  });

  it("hides cached matches immediately after consent changes and never returns email", async () => {
    const { maya, omar } = await pair();
    expect(await matchesFor(db, maya.personId)).toHaveLength(1);
    expect(JSON.stringify(await matchesFor(db, maya.personId))).not.toContain("@intro.edu");
    await savePreferences(db, omar.personId, { discoverable: false, availability: "part_time", intent: "cofounder" });
    expect(await matchesFor(db, maya.personId)).toEqual([]);
  });

  it("hides stale explanations after a profile edit", async () => {
    const { maya, omar, row } = await pair();
    await insertAssertion(db, { subjectType: "person", subjectId: omar.personId, facet: "mechanism_commanded",
      text: "a new capability", sourceType: "subject_edit", confidence: "confirmed",
      provenance: { kind: "subject_edit", person_id: omar.personId } as never });
    expect(await matchesFor(db, maya.personId)).toEqual([]);
    await expect(requestIntroduction(db, row.id, maya.personId)).rejects.toThrow(/changed/);
  });

  it("cancels pending requests on revocation and permits a fresh request after reenrollment", async () => {
    const { maya, omar, row } = await pair();
    const first = await requestIntroduction(db, row.id, maya.personId);
    await revokeMembership(db, await pilotOperator(), omar.personId);

    const [cancelled] = await db.select().from(founderIntroductions).where(eq(founderIntroductions.id, first.introduction.id));
    expect(cancelled).toEqual(expect.objectContaining({ status: "cancelled", cancellationReason: "membership_revoked" }));
    await enrollTestMember(db, omar.personId);
    await savePreferences(db, omar.personId, { discoverable: true, availability: "part_time", intent: "cofounder" });
    const freshResult = await result(maya, omar);
    const fresh = await requestIntroduction(db, freshResult.id, maya.personId);
    expect(fresh.introduction.id).not.toBe(first.introduction.id);
    expect(fresh.introduction.status).toBe("pending");
  });

  it("preserves accepted history but hides contacts while either participant is inactive", async () => {
    const { maya, omar, row } = await pair();
    const { introduction } = await requestIntroduction(db, row.id, maya.personId);
    await respondIntroduction(db, introduction.id, omar.personId, "accepted");
    await revokeMembership(db, await pilotOperator(), omar.personId);

    expect(await introductionContact(db, introduction.id, maya.personId)).toBeNull();
    const [preserved] = await db.select().from(founderIntroductions).where(eq(founderIntroductions.id, introduction.id));
    expect(preserved.status).toBe("accepted");

    await enrollTestMember(db, omar.personId);
    expect(await introductionContact(db, introduction.id, maya.personId)).toEqual({ name: "omar", email: "omar@intro.edu" });
  });

  it("excludes revoked candidates and requires fresh discovery opt-in after reenrollment", async () => {
    const { maya, omar } = await pair();
    expect(await matchesFor(db, maya.personId)).toHaveLength(1);
    await revokeMembership(db, await pilotOperator(), omar.personId);
    expect(await matchesFor(db, maya.personId)).toEqual([]);

    await enrollTestMember(db, omar.personId);
    expect(await matchesFor(db, maya.personId)).toEqual([]);
    await savePreferences(db, omar.personId, { discoverable: true, availability: "part_time", intent: "cofounder" });
    const fresh = await result(maya, omar);
    expect(fresh.assertionSetHash).toBe(await matchingStateHash(db, maya.personId, omar.personId));
  });
});
