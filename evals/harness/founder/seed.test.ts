/** The seed runs the adapters, not a fixture loader — so this test is the
 *  proof that twelve founders arrive with rows on both subjects, and that
 *  running it twice does not make twenty-four. */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, type Db } from "@/db/client";
import { assertions, person, thesisCard } from "@/db/schema";
import { syntheticScript, isoMonth } from "@/harness/founder/synthetic-script";
import { loadSynthetic, seedSynthetic } from "@/harness/founder/seed";

let db: Db;

beforeAll(async () => {
  db = await createPgliteDb();
});

describe("synthetic founders", () => {
  it("the file holds twelve founders, each with a note and a commitment", () => {
    const founders = loadSynthetic();
    expect(founders).toHaveLength(12);
    for (const f of founders) {
      expect(f.note.length).toBeGreaterThan(10);
      expect(f.turns.length).toBeGreaterThanOrEqual(2);
      expect(f.turns.length).toBeLessThanOrEqual(3);
      expect(f.resume.length).toBeGreaterThan(40);
      if (f.available_from) expect(f.available_from).toMatch(/^\d{4}-\d{2}$/);
    }
    expect(new Set(founders.map((f) => f.email)).size).toBe(12);
  });

  it("reads a month out of a commitment line the way the variant would", () => {
    expect(isoMonth("I can go full-time from January 2027, once my contract ends.")).toBe("2027-01");
    expect(isoMonth("Realistically I am not free until June 2028")).toBe("2028-06");
    expect(isoMonth("Full-time whenever")).toBeNull();
  });

  it("seeds twelve founders through the real write path, and again is still twelve", async () => {
    const deps = { structured: syntheticScript() };
    const first = await seedSynthetic(db, deps);
    expect(first.created).toBe(12);

    expect(await db.select().from(person)).toHaveLength(12);
    expect(await db.select().from(thesisCard)).toHaveLength(12);

    const second = await seedSynthetic(db, deps);
    expect(second.created).toBe(0);
    expect(second.existing).toBe(12);
    expect(await db.select().from(person)).toHaveLength(12);
    expect(await db.select().from(thesisCard)).toHaveLength(12);
  });

  it("every founder ends with idea rows and person rows", async () => {
    await seedSynthetic(db, { structured: syntheticScript() });
    const people = await db.select().from(person);
    for (const p of people) {
      const rows = await db.select().from(assertions).where(eq(assertions.subjectId, p.id));
      expect(rows.length, `${p.email} has no person rows`).toBeGreaterThan(0);
      expect(rows.some((r) => r.facet === "mechanism_commanded")).toBe(true);
    }
    const cards = await db.select().from(thesisCard);
    for (const c of cards) {
      const rows = await db.select().from(assertions).where(eq(assertions.subjectId, c.id));
      expect(rows.some((r) => r.facet === "purpose")).toBe(true);
    }
  });

  it("files a commitment month on the person who named one", async () => {
    await seedSynthetic(db, { structured: syntheticScript() });
    const [maya] = await db.select().from(person).where(eq(person.email, "maya@synthetic.edu"));
    const rows = await db.select().from(assertions).where(eq(assertions.subjectId, maya.id));
    const commitment = rows.find((r) => (r.provenance as { kind?: string }).kind === "commitment");
    expect(commitment).toBeDefined();
    expect((commitment!.provenance as { available_from?: string }).available_from).toBe("2027-01");
  });
});
