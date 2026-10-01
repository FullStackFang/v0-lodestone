import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { PersonRequired, createCard, createSession, newSlug } from "@/db/cards";
import { thesisCard } from "@/db/schema";
import { ensurePerson, linkSession } from "@/harness/ledger";
import { ideaSubject, ideasOf, personOf, personSubject } from "./subjects";

let db: Db;

beforeAll(async () => {
  db = await createPgliteDb();
});

describe("subjects", () => {
  it("names an idea by its card and a person by their person row", () => {
    expect(ideaSubject("c1")).toEqual({ subjectType: "idea", subjectId: "c1" });
    expect(personSubject("p1")).toEqual({ subjectType: "person", subjectId: "p1" });
  });

  it("one person, two sessions, two cards", async () => {
    const personId = await ensurePerson(db, { name: "Ada", email: "ada@example.edu" });
    const one = await createSession(db);
    const two = await createSession(db);
    await linkSession(db, one, personId);
    await linkSession(db, two, personId);
    const first = await createCard(db, { sessionId: one, door: "blank" });
    const second = await createCard(db, { sessionId: two, door: "blank" });

    expect(await personOf(db, first.id)).toBe(personId);
    expect(await personOf(db, second.id)).toBe(personId);
    expect((await ideasOf(db, personId)).sort()).toEqual([first.id, second.id].sort());
  });

  it("refuses a card for a session with no person", async () => {
    const legacy = await createSession(db);
    await expect(createCard(db, { sessionId: legacy, door: "blank" })).rejects.toBeInstanceOf(
      PersonRequired,
    );
  });

  it("a legacy card — written before intake asked — has no person", async () => {
    const legacy = await createSession(db);
    const [row] = await db
      .insert(thesisCard)
      .values({ sessionId: legacy, slug: newSlug(), provenance: { source: "chat", doc_id: null } })
      .returning({ id: thesisCard.id });
    expect(await personOf(db, row.id)).toBeNull();
  });

  it("a person with no cards has no ideas", async () => {
    const personId = await ensurePerson(db, { name: "Grace", email: "grace@example.edu" });
    expect(await ideasOf(db, personId)).toEqual([]);
  });
});
