/** The `/me` write paths, through the real server actions.
 *
 * `next/headers` and the database handle are the only things faked — the
 * actions themselves run, so the ownership check, the rung and the
 * supersede-never-delete rule are the code under test rather than a
 * paraphrase of it.
 */
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { createCard, createSession } from "@/db/cards";
import { assertions, person, session } from "@/db/schema";
import { ensurePerson, insertAssertion } from "@/harness/ledger";
import { driftOf } from "@/harness/founder/me";
import { enrollTestMember } from "@/pilot/test-fixtures";

let db: Db;
let cookie = "";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "tf_session" ? { value: cookie } : undefined) }),
}));
vi.mock("@/lib/session", () => ({
  requirePerson: async () => {
    const [row] = await db.select({ person }).from(session).innerJoin(person, eq(session.personId, person.id))
      .where(eq(session.id, cookie));
    if (!row) throw new Error("Sign in to continue.");
    return row.person;
  },
}));
vi.mock("@/db/client", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/db/client")>();
  return { ...real, getDb: async () => db };
});

const { addSought, addCommanded, editAssertion, removeAssertion, updateMatchingPreferences } = await import("./actions");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
};

async function founder(email: string) {
  const personId = await ensurePerson(db, { name: email, email });
  await enrollTestMember(db, personId);
  const sessionId = await createSession(db, personId);
  const card = await createCard(db, { sessionId, door: "blank" });
  return { personId, sessionId, cardId: card.id };
}

async function purpose(personId: string, text: string) {
  return insertAssertion(db, {
    subjectType: "person",
    subjectId: personId,
    facet: "purpose",
    abstractionLevel: "specific",
    text,
    sourceType: "conversation",
    provenance: { kind: "conversation", stage_event_id: "p1" },
  });
}

beforeEach(async () => {
  db = await createPgliteDb();
});

describe("editing on /me", () => {
  it("supersedes the old row with a confirmed one at subject_edit", async () => {
    const me = await founder("edit@me.edu");
    cookie = me.sessionId;
    const row = await purpose(me.personId, "fill empty dental chairs");

    await editAssertion(form({ id: row.id, text: "recover no-show revenue" }));

    const [old] = await db.select().from(assertions).where(eq(assertions.id, row.id));
    expect(old.status).toBe("superseded");
    expect(old.supersededBy).not.toBeNull();

    const [next] = await db.select().from(assertions).where(eq(assertions.id, old.supersededBy!));
    expect(next.text).toBe("recover no-show revenue");
    expect(next.confidence).toBe("confirmed");
    expect(next.sourceType).toBe("subject_edit");
    expect(next.facet).toBe("purpose");
    expect(next.abstractionLevel).toBe("specific");
    expect(next.provenance).toMatchObject({ kind: "subject_edit", person_id: me.personId, edited_from: row.id });
  });

  it("puts the edit on the drift row", async () => {
    const me = await founder("drift@me.edu");
    cookie = me.sessionId;
    const row = await purpose(me.personId, "first words");

    expect(await driftOf(db, [me.personId])).toHaveLength(0);
    await editAssertion(form({ id: row.id, text: "second words" }));

    const [chain] = await driftOf(db, [me.personId]);
    expect(chain.entries.map((e) => e.text)).toEqual(["first words", "second words"]);
    expect(chain.entries.at(-1)!.current).toBe(true);
  });

  it("refuses a row that belongs to someone else", async () => {
    const owner = await founder("owner@me.edu");
    const stranger = await founder("stranger@me.edu");
    const row = await purpose(owner.personId, "not yours");

    cookie = stranger.sessionId;
    await expect(editAssertion(form({ id: row.id, text: "mine now" }))).rejects.toThrow(/not your person row/);

    const [after] = await db.select().from(assertions).where(eq(assertions.id, row.id));
    expect(after.status).toBe("active");
    expect(after.text).toBe("not yours");
  });

  it("refuses an empty edit", async () => {
    const me = await founder("empty@me.edu");
    cookie = me.sessionId;
    const row = await purpose(me.personId, "words");
    await expect(editAssertion(form({ id: row.id, text: "   " }))).rejects.toThrow(/needs words/);
  });

  it("refuses editing or removing the owner's own idea assertions from the profile", async () => {
    const me = await founder("idea-owner@me.edu");
    cookie = me.sessionId;
    const row = await insertAssertion(db, { subjectType: "idea", subjectId: me.cardId, facet: "purpose",
      text: "Canonical card text", sourceType: "canvas",
      provenance: { kind: "canvas", card_id: me.cardId, field: "idea_text", patch_event_id: "p" } });
    await expect(editAssertion(form({ id: row.id, text: "divergent private copy" }))).rejects.toThrow(/idea editor/);
    await expect(removeAssertion(form({ id: row.id }))).rejects.toThrow(/idea editor/);
    const [after] = await db.select().from(assertions).where(eq(assertions.id, row.id));
    expect(after.text).toBe("Canonical card text");
    expect(after.status).toBe("active");
  });
});

describe("removing on /me", () => {
  it("supersedes with no successor and marks it retracted", async () => {
    const me = await founder("remove@me.edu");
    cookie = me.sessionId;
    const row = await insertAssertion(db, {
      subjectType: "person",
      subjectId: me.personId,
      facet: "mechanism_commanded",
      text: "ran procurement",
      sourceType: "resume",
      provenance: { kind: "document", document_id: "d1" },
    });

    await removeAssertion(form({ id: row.id }));

    const [after] = await db.select().from(assertions).where(eq(assertions.id, row.id));
    expect(after.status).toBe("superseded");
    expect(after.supersededBy).toBeNull();
    expect((after.provenance as { retracted?: boolean }).retracted).toBe(true);
  });
});

describe("adding a sought mechanism", () => {
  it("writes one confirmed row on the person", async () => {
    const me = await founder("sought@me.edu");
    cookie = me.sessionId;

    await addSought(form({ text: "distribution in dental supply" }));

    const rows = await db
      .select()
      .from(assertions)
      .where(and(eq(assertions.subjectId, me.personId), eq(assertions.facet, "mechanism_sought")));
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe("distribution in dental supply");
    expect(rows[0].confidence).toBe("confirmed");
    expect(rows[0].sourceType).toBe("subject_edit");
    expect(rows[0].provenance).toMatchObject({ kind: "subject_edit", added_at: "/me" });
  });

  it("lets the founder explicitly state a capability without inferring a missing skill", async () => {
    const me = await founder("commands@me.edu");
    cookie = me.sessionId;
    await addCommanded(form({ text: "Medical device customer research" }));
    const rows = await db.select().from(assertions).where(and(eq(assertions.subjectId, me.personId), eq(assertions.facet, "mechanism_commanded")));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ confidence: "confirmed", subjectType: "person", text: "Medical device customer research" });
  });

  it("rejects invalid preference values and only changes the signed-in person's preferences", async () => {
    const me = await founder("preferences@me.edu");
    cookie = me.sessionId;
    await expect(updateMatchingPreferences(form({ availability: "tomorrow", intent: "cofounder" }))).rejects.toThrow();
    await updateMatchingPreferences(form({ discoverable: "on", availability: "part_time", intent: "cofounder" }));
    const { preferencesFor } = await import("@/harness/founder/preferences");
    expect(await preferencesFor(db, me.personId)).toMatchObject({ discoverable: true, availability: "part_time" });
  });
});

describe("nothing on the page deletes", () => {
  it("leaves every row it has ever written in place", async () => {
    const me = await founder("nodelete@me.edu");
    cookie = me.sessionId;
    const row = await purpose(me.personId, "one");
    const before = (await db.select().from(assertions)).length;

    await editAssertion(form({ id: row.id, text: "two" }));
    await addSought(form({ text: "an engineer" }));
    const mid = await db.select().from(assertions);
    await removeAssertion(form({ id: mid.find((r) => r.text === "an engineer")!.id }));

    const after = await db.select().from(assertions);
    // One edit adds a row, one add adds a row, and the removal adds none —
    // but takes none away either.
    expect(after.length).toBe(before + 2);
    expect(after.filter((r) => r.id === row.id)).toHaveLength(1);
  });

  it("grep: no delete() anywhere under src/app/me", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const path = await import("node:path");
    const dir = path.join(process.cwd(), "src", "app", "me");
    const walk = (at: string): string[] =>
      readdirSync(at).flatMap((name) => {
        const p = path.join(at, name);
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
    const offenders = walk(dir).filter(
      (f) => /\.delete\(|DELETE FROM/i.test(readFileSync(f, "utf8")) && !f.endsWith("actions.test.ts"),
    );
    expect(offenders).toEqual([]);
  });
});
