import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { createCard, createSession } from "@/db/cards";
import { assertions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensurePerson, insertAssertion, supersede } from "@/harness/ledger";
import { commitmentCompatible, cover, facetSim, velocity } from "./score";

/** Unit vectors in a tiny space: exact cosines, no provider. */
const v = (x: number, y: number) => ({ id: `${x},${y}`, embedding: [x, y] });
const EAST = v(1, 0);
const NORTH = v(0, 1);
const NE = { id: "ne", embedding: [Math.SQRT1_2, Math.SQRT1_2] };

let db: Db;

beforeAll(async () => {
  db = await createPgliteDb();
});

describe("facetSim", () => {
  it("is the mean of both directions, not the best match", () => {
    // a: one row identical to one of b's five. Its direction is 1.0; b's is
    // the mean of its own bests, which is lower.
    const a = [EAST];
    const b = [EAST, NORTH, NE, v(0, -1), v(-1, 0)];
    const score = facetSim(a, b)!;
    expect(score).toBeLessThan(1);
    expect(score).toBeGreaterThan(0);
    const other = (1 + Math.SQRT1_2 + 0 - 1 + 0) / 5; // b → a, best-of-one each
    expect(score).toBeCloseTo((1 + other) / 2, 10);
  });

  it("is symmetric", () => {
    const a = [EAST, NE];
    const b = [NORTH];
    expect(facetSim(a, b)).toBeCloseTo(facetSim(b, a)!, 12);
  });

  it("is null, never zero, when either side is empty", () => {
    expect(facetSim([], [EAST])).toBeNull();
    expect(facetSim([EAST], [])).toBeNull();
    // A row with no vector is not a row for this purpose.
    expect(facetSim([{ id: "x", embedding: null }], [EAST])).toBeNull();
  });
});

describe("cover", () => {
  it("is one-directional: their extra mechanisms do not count", () => {
    const sought = [EAST];
    const few = [EAST];
    const many = [EAST, NORTH, v(-1, 0)];
    expect(cover(sought, few)).toBeCloseTo(1, 10);
    expect(cover(sought, many)).toBeCloseTo(1, 10);
    expect(cover(many, sought)!).toBeLessThan(1);
  });

  it("returns null when the candidate commands nothing", () => {
    expect(cover([EAST], [])).toBeNull();
  });
});

describe("commitmentCompatible", () => {
  const at = (available_from: string | null) => ({
    provenance: { kind: "commitment", stage_event_id: "e", available_from },
  });

  it("is 1 at six months and 0 at seven", () => {
    expect(commitmentCompatible([at("2027-01")], [at("2027-07")])).toBe(1);
    expect(commitmentCompatible([at("2027-07")], [at("2027-01")])).toBe(1);
    expect(commitmentCompatible([at("2027-01")], [at("2027-08")])).toBe(0);
  });

  it("is null when either side never said", () => {
    expect(commitmentCompatible([at("2027-01")], [])).toBeNull();
    expect(commitmentCompatible([at("2027-01")], [at(null)])).toBeNull();
    expect(commitmentCompatible([{ provenance: { kind: "conversation", stage_event_id: "e" } }], [at("2027-01")])).toBeNull();
  });
});

describe("velocity", () => {
  it("is superseded over active in the window, capped at 1", async () => {
    const personId = await ensurePerson(db, { name: "V", email: "velocity@example.edu" });
    const sessionId = await createSession(db, personId);
    const card = await createCard(db, { sessionId, door: "blank" });
    // The empty card already carries its ten absences; clear them so the
    // arithmetic is the test's, not the adapter's.
    await db.delete(assertions).where(eq(assertions.subjectId, card.id));
    expect(await velocity(db, card.id)).toBe(0);

    const rows = [];
    for (const text of ["one", "two", "three", "four"]) {
      rows.push(
        await insertAssertion(db, {
          subjectType: "idea",
          subjectId: card.id,
          facet: "purpose",
          text,
          sourceType: "canvas",
          provenance: { kind: "canvas", card_id: card.id, field: text, patch_event_id: "p" },
        }),
      );
    }
    await supersede(db, rows[0].id, {
      subjectType: "idea",
      subjectId: card.id,
      facet: "purpose",
      text: "one, again",
      sourceType: "canvas",
      provenance: { kind: "canvas", card_id: card.id, field: "one", patch_event_id: "p2" },
    });
    // Four active (three untouched plus the successor), one superseded.
    expect(await velocity(db, card.id)).toBeCloseTo(0.25, 10);
  });
});
