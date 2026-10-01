import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { ensurePerson } from "@/harness/ledger";
import { enrollTestMember } from "./test-fixtures";
import { measurementDecision, recordPilotActivity } from "./measurement";
import { pilotAggregateReport } from "./report";
import { createCard, createSession, fieldsOf } from "@/db/cards";
import { cardReview, cardRevision } from "@/db/review-schema";
import { curatedResources, ideaNeeds, resourceRecommendations } from "@/db/resource-schema";

let db: Db;
const operator = { personId: "00000000-0000-4000-8000-000000000099", email: "operator@example.test", emailVerified: true };
const cutoff = new Date("2026-09-15T00:00:00.000Z");

beforeEach(async () => {
  db = await createPgliteDb();
  vi.stubEnv("PILOT_OPERATOR_EMAILS", operator.email);
});

async function participant(email: string, consentedAt = new Date("2026-08-31T12:00:00.000Z")) {
  const id = await ensurePerson(db, { name: email, email });
  await enrollTestMember(db, id, "participant");
  await measurementDecision(db, id, { consent: true, noticeVersion: "measurement-v1" }, consentedAt);
  return id;
}

describe("aggregate pilot report", () => {
  it("reports an unavailable zero denominator and denies ordinary members", async () => {
    const memberId = await participant("member@report.test");
    await expect(pilotAggregateReport(db, { personId: memberId, email: "member@report.test", emailVerified: true }, cutoff)).rejects.toThrow(/operator/);
    const report = await pilotAggregateReport(db, operator, cutoff, cutoff);
    expect(report.returnVisit).toEqual(expect.objectContaining({ numerator: 0, denominator: 0, rate: null }));
    expect(JSON.stringify(report)).not.toContain("member@report.test");
  });

  it("uses exact nonoverlapping UTC weeks and the full consent window", async () => {
    const returned = await participant("returned@report.test");
    const earlyOnly = await participant("early@report.test");
    const lateConsent = await participant("late@report.test", new Date("2026-09-03T00:00:00.000Z"));
    await recordPilotActivity(db, returned, new Date("2026-09-02T10:00:00Z"));
    await recordPilotActivity(db, returned, new Date("2026-09-09T10:00:00Z"));
    await recordPilotActivity(db, earlyOnly, new Date("2026-09-07T23:59:00Z"));
    await recordPilotActivity(db, lateConsent, new Date("2026-09-04T10:00:00Z"));
    await recordPilotActivity(db, lateConsent, new Date("2026-09-10T10:00:00Z"));

    const report = await pilotAggregateReport(db, operator, cutoff, cutoff);
    expect(report.windows).toEqual({ earlier: ["2026-09-01", "2026-09-08"], later: ["2026-09-08", "2026-09-15"] });
    expect(report.returnVisit).toEqual({ numerator: 1, denominator: 2, rate: 0.5 });
    expect(report.eligibility).toContain("active consenting participants");
  });

  it("excludes operator and test enrollments from the eligible population", async () => {
    for (const kind of ["operator", "test"] as const) {
      const id = await ensurePerson(db, { name: kind, email: `${kind}@report.test` });
      await enrollTestMember(db, id, kind);
    }
    const report = await pilotAggregateReport(db, operator, cutoff, cutoff);
    expect(report.eligibleParticipants).toBe(0);
    expect(JSON.stringify(report)).not.toContain("operator@report.test");
    expect(JSON.stringify(report)).not.toContain("test@report.test");
  });

  it("excludes mixed-consent peer work and includes a post-consent outcome on an older recommendation", async () => {
    const owner = await participant("owner-private@report.test", new Date("2026-09-01T00:00:00Z"));
    const reviewer = await ensurePerson(db, { name: "Reviewer", email: "reviewer-private@report.test" });
    await enrollTestMember(db, reviewer, "participant");
    const card = await createCard(db, { sessionId: await createSession(db, owner), door: "blank" });
    const [revision] = await db.insert(cardRevision).values({
      cardId: card.id, ownerId: owner, version: 1, visibility: "cohort", fields: fieldsOf(card), createdAt: new Date("2026-09-04T00:00:00Z"),
    }).returning();
    await db.insert(cardReview).values({
      revisionId: revision.id, reviewerId: reviewer, component: "offering", kind: "challenge",
      text: "PRIVATE REVIEW TEXT", createdAt: new Date("2026-09-05T00:00:00Z"),
    });
    const [need] = await db.insert(ideaNeeds).values({ cardId: card.id, personId: owner, title: "PRIVATE NEED", criteria: "PRIVATE CRITERIA" }).returning();
    const [resource] = await db.insert(curatedResources).values({
      curatorId: owner, kind: "paper", title: "PRIVATE RESOURCE", sourceUrl: "https://example.test/private",
      identifier: "private", sourceDate: "2026", rawText: "PRIVATE SOURCE TEXT", canonicalText: "private source text",
      textHash: "private-hash", claims: [], proposals: [],
    }).returning();
    await db.insert(resourceRecommendations).values({
      needId: need.id, resourceId: resource.id, needRevision: 1, score: 0.8,
      explanation: { matchedTerms: [], snippets: [], explanation: "PRIVATE EXPLANATION", applicability: [], limitations: [], nextAction: "PRIVATE ACTION" },
      createdAt: new Date("2026-08-01T00:00:00Z"), outcome: "helped", outcomeNote: "PRIVATE OUTCOME NOTE",
      outcomeAt: new Date("2026-09-16T00:00:00Z"), readAt: new Date("2026-09-16T00:00:00Z"),
    });

    const report = await pilotAggregateReport(db, operator, cutoff, new Date("2026-09-20T00:00:00Z"));
    expect(report.events.peerReviews).toBe(0);
    expect(report.currentState.resourceOutcomes).toMatchObject({ helped: 1, denominator: 1, usefulnessRate: 1 });
    expect(report.events.resourceAcknowledgements).toBe(0);
    expect(JSON.stringify(report)).not.toContain("PRIVATE");
    expect(JSON.stringify(report)).not.toContain("owner-private");
  });
});
