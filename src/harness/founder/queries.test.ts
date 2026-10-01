/** The query's rules, on rows whose vectors are ours.
 *
 * Two founders are built by hand with two-dimensional embeddings so every
 * component has an arithmetic answer a reader can check. What is being
 * tested is the algebra and the exclusions — whether the *real* ranking is
 * any good is `bench -- pairs`, and that needs a provider.
 */
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { createCard, createSession } from "@/db/cards";
import { EMBEDDING_DIMENSIONS, assertions, matchParams } from "@/db/schema";
import { ensurePerson, insertAssertion } from "@/harness/ledger";
import type { Facet } from "@/harness/schema";
import { query } from "./queries";
import { COFOUNDER } from "./weights";
import { publishFixture } from "./test-fixtures";
import { savePreferences } from "./preferences";

let db: Db;

/** A direction in the first two dimensions of the real 1024-d space, so the
 *  cosine between two of these is the cosine between two angles and the
 *  column still takes them. */
const unit = (deg: number) => {
  const r = (deg * Math.PI) / 180;
  const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  v[0] = Math.cos(r);
  v[1] = Math.sin(r);
  return v;
};

async function person(name: string) {
  const personId = await ensurePerson(db, { name, email: `${name}@q.edu` });
  const sessionId = await createSession(db, personId);
  const card = await createCard(db, { sessionId, door: "blank" });
  // The empty card's absences would otherwise be the only rows there are.
  await db.delete(assertions).where(eq(assertions.subjectId, card.id));
  return { personId, cardId: card.id };
}

async function row(
  subject: { type: "person" | "idea"; id: string },
  facet: Facet,
  text: string,
  vector: number[] | null,
  over: { level?: "specific" | "abstract" | "core"; provenance?: Record<string, unknown> } = {},
) {
  return insertAssertion(db, {
    subjectType: subject.type,
    subjectId: subject.id,
    facet,
    abstractionLevel: over.level ?? null,
    text,
    sourceType: "conversation",
    provenance: (over.provenance ?? { kind: "conversation", stage_event_id: `e-${text}` }) as never,
    embedding: vector,
    embeddingModel: vector ? "test" : null,
  });
}

beforeEach(async () => {
  db = await createPgliteDb();
});

/** Maya seeks engineering and commands operations; Omar is her mirror. */
async function pair() {
  const maya = await person("maya");
  const omar = await person("omar");
  await row({ type: "idea", id: maya.cardId }, "purpose", "fill empty dental chairs", unit(0), { level: "specific" });
  await row({ type: "idea", id: maya.cardId }, "purpose", "reduce empty chair time", unit(10), { level: "abstract" });
  await row({ type: "idea", id: maya.cardId }, "domain", "dental practice", unit(20));
  await row({ type: "person", id: maya.personId }, "mechanism_commanded", "dental procurement", unit(90));
  await row({ type: "person", id: maya.personId }, "mechanism_sought", "an engineer", unit(180));

  await row({ type: "idea", id: omar.cardId }, "purpose", "fill empty dental chairs", unit(2), { level: "specific" });
  await row({ type: "idea", id: omar.cardId }, "purpose", "reduce empty chair time", unit(12), { level: "abstract" });
  await row({ type: "idea", id: omar.cardId }, "domain", "dental practice", unit(22));
  await row({ type: "person", id: omar.personId }, "mechanism_commanded", "iOS engineering", unit(181));
  await row({ type: "person", id: omar.personId }, "mechanism_sought", "a dental operator", unit(91));
  await publishFixture(db, maya.personId, maya.cardId);
  await publishFixture(db, omar.personId, omar.cardId);
  return { maya, omar };
}

describe("query(cofounder)", () => {
  it("scores every component and names the ones nobody could answer", async () => {
    const { maya, omar } = await pair();
    const { results, unknown } = await query(db, "cofounder", { personId: maya.personId }, 3);

    expect(results).toHaveLength(1);
    const [top] = results;
    expect(top.candidateSubjectId).toBe(omar.personId);
    expect(Object.keys(top.components).sort()).toEqual([
      "commitment_compatible",
      "cover_sought_commanded",
      "overlap_mechanism_commanded",
      "sim_domain",
      "sim_purpose_abstract",
      "sim_purpose_specific",
      "velocity",
    ]);
    // Neither said when they could start, so the term is unknown, not zero.
    expect(top.components.commitment_compatible).toBeNull();
    expect(unknown).toContain("commitment_compatible");
    // Complementary skills: the penalty term is near zero, coverage near one.
    expect(top.components.overlap_mechanism_commanded!).toBeLessThan(0.1);
    expect(top.components.cover_sought_commanded!).toBeGreaterThan(0.99);
  });

  it("excludes a candidate with no commanded mechanism, by name", async () => {
    const { maya } = await pair();
    const ghost = await person("ghost");
    await row({ type: "idea", id: ghost.cardId }, "purpose", "fill empty dental chairs", unit(1), {
      level: "specific",
    });
    await publishFixture(db, ghost.personId, ghost.cardId);

    const { results, excluded } = await query(db, "cofounder", { personId: maya.personId }, 5);
    expect(results.map((r) => r.candidateSubjectId)).not.toContain(ghost.personId);
    expect(excluded).toContainEqual({ candidateSubjectId: ghost.personId, reason: "capability not stated" });
  });

  it("never returns the query person or their own cards", async () => {
    const { maya } = await pair();
    const { results } = await query(db, "cofounder", { personId: maya.personId }, 5);
    expect(results.map((r) => r.candidateSubjectId)).not.toContain(maya.personId);
    expect(results.map((r) => r.candidateSubjectId)).not.toContain(maya.cardId);
  });

  it("excludes opted-out and incompatible candidates even when vectors match", async () => {
    const { maya, omar } = await pair();
    await savePreferences(db, omar.personId, { discoverable: false, availability: "part_time", intent: "cofounder" });
    expect((await query(db, "cofounder", { personId: maya.personId }, 5)).results).toEqual([]);
    await savePreferences(db, omar.personId, { discoverable: true, availability: "full_time", intent: "cofounder" });
    expect((await query(db, "cofounder", { personId: maya.personId }, 5)).results).toEqual([]);
    await savePreferences(db, omar.personId, { discoverable: true, availability: "part_time", intent: "collaborator" });
    expect((await query(db, "cofounder", { personId: maya.personId }, 5)).results).toEqual([]);
  });

  it("reads λ and μ from the table on every call", async () => {
    const { maya } = await pair();
    // The contract seeds a row per edge; this moves it rather than adding one.
    await db.update(matchParams).set({ lambda: 0, mu: 0.3 }).where(eq(matchParams.edgeType, "cofounder"));
    const before = (await query(db, "cofounder", { personId: maya.personId }, 1)).results[0].score;

    // μ is what pays for complementary skills; take it away and the score
    // must fall, with no restart in between.
    await db.update(matchParams).set({ mu: 0 }).where(eq(matchParams.edgeType, "cofounder"));
    const after = (await query(db, "cofounder", { personId: maya.personId }, 1)).results[0].score;
    expect(after).toBeLessThan(before);
  });

  it("a commitment six months apart counts, seven does not", async () => {
    const { maya, omar } = await pair();
    const commitment = (available_from: string) => ({
      kind: "commitment",
      stage_event_id: `c-${available_from}`,
      available_from,
    });
    await row({ type: "person", id: maya.personId }, "constraint", "free from January", null, {
      provenance: commitment("2027-01"),
    });
    await row({ type: "person", id: omar.personId }, "constraint", "free from July", null, {
      provenance: commitment("2027-07"),
    });

    const { results } = await query(db, "cofounder", { personId: maya.personId }, 1);
    expect(results[0].components.commitment_compatible).toBe(1);
  });

  it("names the pair of rows that pulled the candidate in", async () => {
    const { maya } = await pair();
    const { results } = await query(db, "cofounder", { personId: maya.personId }, 1);
    const purpose = results[0].contributions.find((c) => c.family === "purpose")!;
    const [mine] = await db
      .select()
      .from(assertions)
      .where(and(eq(assertions.id, purpose.query), eq(assertions.subjectId, maya.cardId)));
    expect(mine).toBeDefined();
  });

  it("refuses an edge that is specified but not built", async () => {
    const { maya } = await pair();
    await expect(query(db, "mentor", { personId: maya.personId }, 3)).rejects.toThrow(/hundred judgments/);
  });

  it("uses the weights it is handed", async () => {
    const { maya } = await pair();
    const base = (await query(db, "cofounder", { personId: maya.personId }, 1)).results[0].score;
    const doubled = (
      await query(db, "cofounder", { personId: maya.personId }, 1, { ...COFOUNDER, abs: COFOUNDER.abs * 2 })
    ).results[0].score;
    expect(doubled).toBeGreaterThan(base);
  });
});
