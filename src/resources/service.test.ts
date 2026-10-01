import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createPgliteDb, type Db } from "@/db/client";
import { createCard, createSession } from "@/db/cards";
import { resourceRecommendations } from "@/db/resource-schema";
import { thesisCard } from "@/db/schema";
import { ensurePerson } from "@/harness/ledger";
import { createResearchIdea, createNeed, updateNeed, importResource, refreshResources, listResourcesForPerson, recordOutcome, markRead } from "./service";
import { enrollTestMember } from "@/pilot/test-fixtures";

let db: Db;
let owner: string;
let stranger: string;
let cardId: string;
const input = {
  kind: "technology_disclosure", title: "Water sensor", sourceUrl: "https://example.edu/tech/sensor",
  identifier: "tech-sensor", sourceDate: "2026-02-01", rawText: "Optical sensing monitors water quality.",
  claims: [{ facet: "purpose", text: "Water quality monitoring", quote: "Optical sensing monitors water quality.", prefix: "" }],
};

beforeAll(async () => {
  db = await createPgliteDb();
  owner = await ensurePerson(db, { name: "Owner", email: "curator@resource.test" });
  stranger = await ensurePerson(db, { name: "Stranger", email: "stranger@resource.test" });
  await enrollTestMember(db, owner);
  await enrollTestMember(db, stranger);
  cardId = (await createCard(db, { sessionId: await createSession(db, owner), door: "blank" })).id;
});

describe("persistent resource watch", () => {
  it("saves an idea and its first need together for the session owner", async () => {
    const sessionId = await createSession(db, owner);
    const { card, need } = await createResearchIdea(db, sessionId, {
      idea: "  A local friendship group  ", title: "Reconnect after meeting", criteria: "A second conversation within a week",
    });
    expect(card.ideaText).toBe("A local friendship group");
    expect(card.sessionId).toBe(sessionId);
    expect(need).toMatchObject({ cardId: card.id, personId: owner, revision: 1, monitoring: true });
    expect((await listResourcesForPerson(db, owner)).needs.find(n => n.id === need.id)?.criteria).toBe("A second conversation within a week");
    const before = await db.select({ id: thesisCard.id }).from(thesisCard);
    await expect(createResearchIdea(db, sessionId, { idea: "Another", title: "Need", criteria: " " })).rejects.toThrow();
    expect(await db.select({ id: thesisCard.id }).from(thesisCard)).toEqual(before);
  });
  it("rejects intake from an inactive or unowned session without leaving an idea", async () => {
    const inactive = await ensurePerson(db, { name: "Inactive", email: "inactive@resource.test" });
    const before = await db.select({ id: thesisCard.id }).from(thesisCard);
    for (const sessionId of [await createSession(db, inactive), await createSession(db)]) {
      await expect(createResearchIdea(db, sessionId, { idea: "Private idea", title: "A need", criteria: "A test" })).rejects.toThrow();
    }
    expect(await db.select({ id: thesisCard.id }).from(thesisCard)).toEqual(before);
  });
  it("rolls back the new idea if saving its need fails in the database", async () => {
    await db.execute(sql`CREATE FUNCTION reject_research_test_need() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test need write failure'; END $$`);
    await db.execute(sql`CREATE TRIGGER reject_research_test_need BEFORE INSERT ON idea_needs FOR EACH ROW EXECUTE FUNCTION reject_research_test_need()`);
    const before = await db.select({ id: thesisCard.id }).from(thesisCard);
    try {
      await expect(createResearchIdea(db, await createSession(db, owner), { idea: "Rollback example", title: "A need", criteria: "A test" })).rejects.toThrow();
      expect(await db.select({ id: thesisCard.id }).from(thesisCard)).toEqual(before);
    } finally {
      await db.execute(sql`DROP TRIGGER reject_research_test_need ON idea_needs`);
      await db.execute(sql`DROP FUNCTION reject_research_test_need()`);
    }
  });
  it("rejects another founder's card and need without changing state", async () => {
    const need = await createNeed(db, owner, { cardId, title: "Water quality", criteria: "optical sensing" });
    await expect(createNeed(db, stranger, { cardId, title: "Water quality", criteria: "optical sensing" })).rejects.toThrow(/owner|owned|access/i);
    await expect(updateNeed(db, stranger, need.id, { title: "Changed", criteria: "Changed", status: "resolved", monitoring: true })).rejects.toThrow(/owner|owned|access/i);
    expect((await listResourcesForPerson(db, stranger)).needs).toEqual([]);
  });
  it("restricts corpus writes to configured curator identity and deduplicates import", async () => {
    vi.stubEnv("RESOURCE_CURATOR_EMAILS", "curator@resource.test");
    await expect(importResource(db, stranger, input)).rejects.toThrow(/curator/i);
    const first = await importResource(db, owner, input);
    const second = await importResource(db, owner, input);
    expect(second.id).toBe(first.id);
  });
  it("connects an older need to a new source once and retains read/outcome state", async () => {
    vi.stubEnv("RESOURCE_CURATOR_EMAILS", "curator@resource.test");
    const need = await createNeed(db, owner, { cardId, title: "Water quality", criteria: "optical sensing" });
    await importResource(db, owner, { ...input, sourceUrl: "https://example.edu/tech/new-sensor" });
    await refreshResources(db, { personId: owner });
    const first = (await listResourcesForPerson(db, owner)).recommendations.filter((r: any) => r.need.id === need.id);
    expect(first).toHaveLength(2);
    await markRead(db, owner, first[0].recommendation.id);
    await expect(recordOutcome(db, owner, first[0].recommendation.id, "helped", "  ")).rejects.toThrow(/next action/i);
    expect((await listResourcesForPerson(db, owner)).recommendations.find(r => r.recommendation.id === first[0].recommendation.id)?.recommendation.outcome).toBeNull();
    await recordOutcome(db, owner, first[0].recommendation.id, "helped", "Changed experiment design");
    expect((await refreshResources(db, { personId: owner })).created).toBe(0);
    const again = (await listResourcesForPerson(db, owner)).recommendations.find((r: any) => r.recommendation.id === first[0].recommendation.id);
    if (!again) throw new Error("Expected persisted recommendation");
    expect(again.recommendation.outcome).toBe("helped");
    expect(again.recommendation.readAt).not.toBeNull();
    await expect(recordOutcome(db, stranger, first[0].recommendation.id, "dismissed", "")).rejects.toThrow(/owner|owned|access/i);
  });
  it("refreshes stale source explanations without repeating notifications or losing outcomes", async () => {
    vi.stubEnv("RESOURCE_CURATOR_EMAILS", "curator@resource.test");
    const resource = await importResource(db, owner, {
      ...input,
      sourceUrl: "https://example.edu/tech/calibration",
      rawText: `${input.rawText} Laboratory calibration is required.`,
      claims: [...input.claims, { facet: "limitations", text: "No calibration needed", quote: "Laboratory calibration is required.", prefix: "water quality." }],
    });
    const need = await createNeed(db, owner, { cardId, title: "Water quality", criteria: "optical sensing" });
    await refreshResources(db, { personId: owner });
    const first = (await listResourcesForPerson(db, owner)).recommendations.find((row) => row.need.id === need.id && row.resource.id === resource.id)!;
    await recordOutcome(db, owner, first.recommendation.id, "helped", "Reviewed calibration requirements");
    await db.update(resourceRecommendations).set({
      explanation: { ...first.recommendation.explanation, limitations: ["No calibration needed"] },
    }).where(eq(resourceRecommendations.id, first.recommendation.id));

    const result = await refreshResources(db, { personId: owner });
    const current = (await listResourcesForPerson(db, owner)).recommendations.find((row) => row.recommendation.id === first.recommendation.id)!;
    expect(current.recommendation.explanation.limitations).toEqual(["Laboratory calibration is required."]);
    expect(current.recommendation.needRevision).toBe(need.revision);
    expect(current.recommendation.outcome).toBe("helped");
    expect(current.recommendation.outcomeNote).toBe("Reviewed calibration requirements");
    expect(current.recommendation.readAt).not.toBeNull();
    expect(result.created).toBe(0);
  });

  it("skips paused, resolved and unmonitored needs and suppresses stale revisions", async () => {
    const need = await createNeed(db, owner, { cardId, title: "Water quality", criteria: "optical sensing" });
    await refreshResources(db, { personId: owner });
    for (const state of [{ status: "paused", monitoring: true }, { status: "resolved", monitoring: true }, { status: "active", monitoring: false }]) {
      await updateNeed(db, owner, need.id, { title: "Water quality", criteria: "optical sensing", ...state });
      await refreshResources(db, { personId: owner });
      const view = await listResourcesForPerson(db, owner);
      expect(view.recommendations.filter((r: any) => r.need.id === need.id)).toHaveLength(0);
    }
    await updateNeed(db, owner, need.id, { title: "Restaurant tables", criteria: "reservation scheduling", status: "active", monitoring: true });
    await refreshResources(db, { personId: owner });
    expect((await listResourcesForPerson(db, owner)).recommendations.filter((r: any) => r.need.id === need.id)).toHaveLength(0);
  });
});
