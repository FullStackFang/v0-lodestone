/** The person step: what the intake page decides, and what a card refuses.
 *  The page itself only asks `currentPerson` and renders one branch or the
 *  other, so that call is the seam worth testing. */
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { PersonRequired, createCard, createSession, personOfSession, sameFounder } from "@/db/cards";
import { person } from "@/db/schema";
import { ensurePerson, linkSession } from "@/harness/ledger";

let db: Db;

beforeAll(async () => {
  db = await createPgliteDb();
});

describe("a founder is a person before a card exists", () => {
  it("first visit: the session has no person, so the form is what renders", async () => {
    const fresh = await createSession(db);
    expect(await personOfSession(db, fresh)).toBeNull();
  });

  it("the same email from a second browser is the same person, under the first name", async () => {
    const first = await createSession(db);
    const id = await ensurePerson(db, { name: "Ada Lovelace", email: "ada@second.edu" });
    await linkSession(db, first, id);

    const second = await createSession(db);
    const again = await ensurePerson(db, { name: "A. L.", email: "ADA@second.edu" });
    await linkSession(db, second, again);

    expect(again).toBe(id);
    const rows = await db.select().from(person);
    expect(rows.filter((r) => r.email === "ada@second.edu")).toHaveLength(1);
    expect(rows.find((r) => r.id === id)!.name).toBe("Ada Lovelace");
    expect(await personOfSession(db, second)).toBe(id);
  });

  it("a card refuses a session with no person", async () => {
    const legacy = await createSession(db);
    await expect(createCard(db, { sessionId: legacy, door: "blank" })).rejects.toBeInstanceOf(
      PersonRequired,
    );
  });

  it("two sessions of one person are one founder; two person-less ones are not", async () => {
    const id = await ensurePerson(db, { name: "Grace", email: "grace@founder.edu" });
    const a = await createSession(db, id);
    const b = await createSession(db, id);
    const stranger = await createSession(db, await ensurePerson(db, { name: "X", email: "x@founder.edu" }));
    const legacyOne = await createSession(db);
    const legacyTwo = await createSession(db);

    expect(await sameFounder(db, a, b)).toBe(true);
    expect(await sameFounder(db, a, a)).toBe(true);
    expect(await sameFounder(db, a, stranger)).toBe(false);
    expect(await sameFounder(db, legacyOne, legacyTwo)).toBe(false);
  });
});
