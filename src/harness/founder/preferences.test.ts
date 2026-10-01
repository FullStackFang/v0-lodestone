import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { createCard, createSession, fieldsOf } from "@/db/cards";
import { cardRevision } from "@/db/review-schema";
import { assertions } from "@/db/schema";
import { ensurePerson, insertAssertion, supersede } from "../ledger";
import { enrollTestMember } from "@/pilot/test-fixtures";
import { compatiblePreferences, matchingRows, matchingStateHash, preferencesFor, savePreferences } from "./preferences";

let db: Db;
beforeEach(async () => { db = await createPgliteDb(); });

describe("founder discovery preferences", () => {
  it("defaults to private and unavailable", async () => {
    const id = await ensurePerson(db, { name: "Maya", email: "maya@prefs.edu" });
    expect(await preferencesFor(db, id)).toMatchObject({ discoverable: false, availability: "unavailable" });
    expect(await matchingRows(db, id)).toEqual([]);
  });

  it("requires opt-in, an active availability, and the same collaboration intent", () => {
    const ready = { discoverable: true, availability: "part_time" as const, intent: "cofounder" as const };
    expect(compatiblePreferences(ready, ready)).toBe(true);
    expect(compatiblePreferences(ready, { ...ready, discoverable: false })).toBe(false);
    expect(compatiblePreferences(ready, { ...ready, availability: "unavailable" })).toBe(false);
    expect(compatiblePreferences(ready, { ...ready, availability: "full_time" })).toBe(false);
    expect(compatiblePreferences(ready, { ...ready, availability: "exploring" })).toBe(true);
    expect(compatiblePreferences(ready, { ...ready, intent: "collaborator" })).toBe(false);
  });

  it("shares only current cohort publications and drops a newer private draft", async () => {
    const id = await ensurePerson(db, { name: "Maya", email: "shared@prefs.edu" });
    await enrollTestMember(db, id);
    const sessionId = await createSession(db, id);
    const card = await createCard(db, { sessionId, door: "blank" });
    await db.delete(assertions).where(eq(assertions.subjectId, card.id));
    await savePreferences(db, id, { discoverable: true, availability: "part_time", intent: "cofounder" });
    const add = (text: string) => insertAssertion(db, {
      subjectType: "idea", subjectId: card.id, facet: "purpose", abstractionLevel: "specific", text,
      sourceType: "canvas", provenance: { kind: "canvas", card_id: card.id, field: "idea_text", patch_event_id: "p" },
    });
    const published = await add("public purpose");
    await add("private purpose");
    const [revision] = await db.insert(cardRevision).values({
      cardId: card.id, ownerId: id, version: 1, visibility: "cohort",
      fields: { ...fieldsOf(card), idea_text: "public purpose" },
    }).returning();
    expect((await matchingRows(db, id)).map((r) => r.id)).toEqual([published.id]);
    await db.update(cardRevision).set({ revokedAt: new Date() }).where(eq(cardRevision.id, revision.id));
    expect(await matchingRows(db, id)).toEqual([]);
  });

  it("keeps published facts and frozen evidence metadata through private supersession", async () => {
    const id = await ensurePerson(db, { name: "Maya", email: "history@prefs.edu" });
    await enrollTestMember(db, id);
    const other = await ensurePerson(db, { name: "Omar", email: "other@prefs.edu" });
    const card = await createCard(db, { sessionId: await createSession(db, id), door: "blank" });
    await db.delete(assertions).where(eq(assertions.subjectId, card.id));
    await savePreferences(db, id, { discoverable: true, availability: "part_time", intent: "cofounder" });
    const publicFact = await insertAssertion(db, {
      subjectType: "idea", subjectId: card.id, facet: "purpose", abstractionLevel: "specific", text: "Published value",
      sourceType: "canvas", evidenceType: "observed_behavior",
      provenance: { kind: "canvas", card_id: card.id, field: "value_proposition", patch_event_id: "private-metadata" },
    });
    const [revision] = await db.insert(cardRevision).values({ cardId: card.id, ownerId: id, version: 1, visibility: "cohort",
      fields: { ...fieldsOf(card), value_proposition: "Published value" } }).returning();
    const before = await matchingStateHash(db, id, other);
    await supersede(db, publicFact.id, {
      subjectType: "idea", subjectId: card.id, facet: "purpose", abstractionLevel: "specific", text: "Private new value",
      sourceType: "canvas", provenance: { kind: "canvas", card_id: card.id, field: "value_proposition", patch_event_id: "secret" },
    });
    const rows = await matchingRows(db, id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: publicFact.id, text: "Published value", evidenceType: null, confidence: "extracted", status: "active", quote: null });
    expect(rows[0].provenance).toMatchObject({ publication_id: revision.id, field: "value_proposition" });
    expect(JSON.stringify(rows)).not.toContain("secret");
    expect(JSON.stringify(rows)).not.toContain("Private new value");
    expect(await matchingStateHash(db, id, other)).toBe(before);
    await db.insert(cardRevision).values({ cardId: card.id, ownerId: id, version: 2, visibility: "cohort",
      fields: { ...fieldsOf(card), value_proposition: "Private new value" } });
    expect((await matchingRows(db, id))[0].text).toBe("Private new value");
    expect(await matchingStateHash(db, id, other)).not.toBe(before);
  });

  it("represents a published field even when the ledger has no corresponding assertion", async () => {
    const id = await ensurePerson(db, { name: "Maya", email: "virtual@prefs.edu" });
    await enrollTestMember(db, id);
    const card = await createCard(db, { sessionId: await createSession(db, id), door: "blank" });
    await savePreferences(db, id, { discoverable: true, availability: "part_time", intent: "cofounder" });
    await db.insert(cardRevision).values({ cardId: card.id, ownerId: id, version: 1, visibility: "cohort",
      fields: { ...fieldsOf(card), value_proposition: "Snapshot-only value" } });
    const rows = await matchingRows(db, id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ text: "Snapshot-only value", embedding: null, subjectId: card.id });
    expect((await matchingRows(db, id))[0].id).toBe(rows[0].id);
  });
});
