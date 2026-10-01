/** The fixture is the map. Set equality against three cards, then the four
 *  rules that are easy to state and easy to break. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { applyPatch, createCard, createSession, getCard } from "@/db/cards";
import { assertions } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { ensurePerson } from "@/harness/ledger";
import { EMPTY_FIELDS, type CardFields } from "@/schema/card";
import { applyCanvas, canvasAssertions } from "./canvas";
import { personOf } from "./subjects";

interface Expected {
  facet: string;
  level: string | null;
  subject: string;
  text: string;
  evidence_type: string | null;
  field: string;
}

const fixture = JSON.parse(
  readFileSync(path.join(process.cwd(), "evals", "harness", "founder", "canvas-fixture.json"), "utf8"),
) as {
  personId: string;
  cards: { name: string; fields: CardFields; expected: Expected[] }[];
};

const cardNamed = (name: string) => fixture.cards.find((c) => c.name === name)!;

/** The six keys the fixture pins. Sorted so the diff on a failure reads. */
const shape = (rows: ReturnType<typeof canvasAssertions>): Expected[] =>
  rows
    .map((r) => ({
      facet: r.facet,
      level: r.abstractionLevel,
      subject: r.subjectType,
      text: r.text,
      evidence_type: r.evidenceType,
      field: r.field,
    }))
    .sort((a, b) => a.field.localeCompare(b.field) || a.text.localeCompare(b.text));

const sorted = (rows: Expected[]) =>
  [...rows].sort((a, b) => a.field.localeCompare(b.field) || a.text.localeCompare(b.text));

let db: Db;

beforeAll(async () => {
  db = await createPgliteDb();
});

describe("canvasAssertions", () => {
  for (const card of fixture.cards) {
    it(`reproduces the fixture's ${card.name} card exactly`, () => {
      expect(shape(canvasAssertions(card.fields, fixture.personId))).toEqual(sorted(card.expected));
    });
  }

  it("an enum with a free-text sibling rides in that row's provenance", () => {
    const rows = canvasAssertions(cardNamed("full").fields, fixture.personId);
    const offering = rows.find((r) => r.field === "offering")!;
    expect(offering.facet).toBe("mechanism.product");
    expect(offering.extra).toEqual({ enums: { offering_type: "saas" } });
    expect(rows.some((r) => r.field === "facets.offering_type")).toBe(false);

    const segment = rows.find((r) => r.field === "segment.description")!;
    expect(segment.extra).toEqual({
      enums: { industry_group: "healthcare", buyer_role: "owner_founder", org_size: "smb" },
    });
  });

  it("an enum with no sibling is a row of its own", () => {
    const rows = canvasAssertions(cardNamed("full").fields, fixture.personId);
    expect(rows.find((r) => r.field === "facets.business_model")).toMatchObject({
      facet: "mechanism.revenue",
      text: "subscription",
    });
    expect(rows.find((r) => r.field === "facets.quadrant")).toMatchObject({
      facet: "evaluation",
      text: "painkiller",
    });
  });

  it("an evidence row carries the card's evidence_type; team-market fit stays on the idea", () => {
    const rows = canvasAssertions(cardNamed("full").fields, fixture.personId);
    expect(rows.find((r) => r.field === "evidence[0]")).toMatchObject({
      facet: "evidence",
      subjectType: "idea",
      evidenceType: "observed_behavior",
      extra: { source: "founder's notes", date: "2026-03" },
    });
    const tmf = rows.find((r) => r.field === "rubric_scores.team_market_fit")!;
    expect(tmf.facet).toBe("evaluation");
    expect(tmf.subjectType).toBe("idea");
    expect(tmf.evidenceType).toBe("incurred_cost");
  });

  it("an unfair advantage is the person's, and founder_intent files nothing", () => {
    const rows = canvasAssertions(cardNamed("full").fields, fixture.personId);
    const advantage = rows.find((r) => r.field === "founder_context.unfair_advantages[0]")!;
    expect(advantage).toMatchObject({
      facet: "mechanism_commanded",
      subjectType: "person",
      evidenceType: "stated_opinion",
    });
    expect(rows.some((r) => r.facet === "mechanism_sought")).toBe(false);
    expect(rows.some((r) => r.field.startsWith("facets.founder_intent"))).toBe(false);
    expect(rows.some((r) => r.field === "facets.one_liner")).toBe(false);
  });

  it("a legacy session with no person yields idea rows only", () => {
    const rows = canvasAssertions(cardNamed("full").fields, null);
    expect(rows.some((r) => r.subjectType === "person")).toBe(false);
    expect(rows.some((r) => r.field === "idea_text")).toBe(true);
    // Absence is still only ever the idea's.
    expect(rows.filter((r) => r.text === "not_stated").every((r) => r.subjectType === "idea")).toBe(true);
  });

  it("never writes a not_stated row for a person facet", () => {
    for (const card of fixture.cards) {
      const rows = canvasAssertions(card.fields, fixture.personId);
      const absent = rows.filter((r) => r.text === "not_stated");
      expect(absent.some((r) => r.facet === "mechanism_commanded" || r.facet === "mechanism_sought")).toBe(false);
    }
  });
});

async function seed(email: string) {
  const personId = await ensurePerson(db, { name: email, email });
  const sessionId = await createSession(db, personId);
  const card = await createCard(db, { sessionId, door: "blank" });
  return { personId, sessionId, card };
}

const activeFor = (cardId: string) =>
  db
    .select()
    .from(assertions)
    .where(
      and(
        eq(assertions.status, "active"),
        eq(assertions.sourceType, "canvas"),
        sql`${assertions.provenance} ->> 'card_id' = ${cardId}`,
      ),
    );

describe("applyCanvas", () => {
  it("writes the empty card's absences, then nothing at all on an unchanged patch", async () => {
    const { card } = await seed("apply-unchanged@example.edu");
    await applyCanvas(db, card.id, "patch-1");
    const first = await activeFor(card.id);
    expect(first).toHaveLength(cardNamed("empty").expected.length);

    await applyCanvas(db, card.id, "patch-2");
    const second = await activeFor(card.id);
    expect(second.map((r) => r.id).sort()).toEqual(first.map((r) => r.id).sort());
  });

  it("supersedes only the field that changed", async () => {
    const { card } = await seed("apply-changed@example.edu");
    const patched = await applyPatch(db, card, { offering: "a $349/mo SaaS" });
    await applyCanvas(db, patched.id, "patch-1");
    const before = await activeFor(card.id);
    const offering = before.find((r) => (r.provenance as { field: string }).field === "offering")!;
    const untouched = before.filter((r) => r.id !== offering.id).map((r) => r.id).sort();

    const again = await applyPatch(db, (await getCard(db, card.id))!, { offering: "a $499/mo SaaS" });
    await applyCanvas(db, again.id, "patch-2");

    const after = await activeFor(card.id);
    const next = after.find((r) => (r.provenance as { field: string }).field === "offering")!;
    expect(next.text).toBe("a $499/mo SaaS");
    const [old] = await db.select().from(assertions).where(eq(assertions.id, offering.id));
    expect(old.status).toBe("superseded");
    expect(old.supersededBy).toBe(next.id);
    expect(after.filter((r) => r.id !== next.id).map((r) => r.id).sort()).toEqual(untouched);
  });

  it("supersedes evidence and rubric rows when only the evidence basis changes", async () => {
    const { card } = await seed("apply-evidence-basis@example.edu");
    const fields = structuredClone(cardNamed("full").fields);
    const first = await applyPatch(db, card, fields);
    const before = await activeFor(card.id);
    fields.evidence![0].evidence_type = "incurred_cost";
    fields.rubric_scores!.team_market_fit.evidence_type = "observed_behavior";

    await applyPatch(db, first, { evidence: fields.evidence, rubric_scores: fields.rubric_scores });
    const after = await activeFor(card.id);
    for (const field of ["evidence[0]", "rubric_scores.team_market_fit"]) {
      const previous = before.find((r) => r.provenance.field === field)!;
      const current = after.find((r) => r.provenance.field === field)!;
      expect(current.text).toBe(previous.text);
      expect(current.id).not.toBe(previous.id);
      expect(current.evidenceType).toBe(field === "evidence[0]" ? "incurred_cost" : "observed_behavior");
      const [history] = await db.select().from(assertions).where(eq(assertions.id, previous.id));
      expect(history).toMatchObject({ status: "superseded", supersededBy: current.id });
    }
    expect(await applyCanvas(db, card.id, "unchanged-basis")).toMatchObject({ inserted: 0, superseded: 0, retired: 0 });
  });

  it("keeps matching enums and falsifiability current without changing claim text", async () => {
    const { card } = await seed("apply-enums@example.edu");
    const fields = structuredClone(cardNamed("full").fields);
    const first = await applyPatch(db, card, fields);
    const before = await activeFor(card.id);
    fields.facets!.offering_type = "service";
    fields.facets!.segment.buyer_role = "procurement";
    fields.facets!.segment.org_size = "enterprise";
    fields.kill_assumption!.falsifiable = !fields.kill_assumption!.falsifiable;

    await applyPatch(db, first, { facets: fields.facets, kill_assumption: fields.kill_assumption });
    const after = await activeFor(card.id);
    for (const field of ["offering", "segment.description", "kill_assumption.assumption"]) {
      const previous = before.find((r) => r.provenance.field === field)!;
      const current = after.find((r) => r.provenance.field === field)!;
      expect(current.text).toBe(previous.text);
      expect(current.id).not.toBe(previous.id);
      const desired = canvasAssertions(fields, fixture.personId).find((r) => r.field === field)!;
      expect(current.provenance).toMatchObject(desired.extra!);
    }
    expect(after.find((r) => r.provenance.field === "idea_text")!.id)
      .toBe(before.find((r) => r.provenance.field === "idea_text")!.id);
    expect(await applyCanvas(db, card.id, "unchanged-enums")).toMatchObject({ inserted: 0, superseded: 0, retired: 0 });
  });

  it("supersedes source/date edits and clears removed metadata", async () => {
    const { card } = await seed("apply-provenance@example.edu");
    const fields = structuredClone(cardNamed("full").fields);
    let currentCard = await applyPatch(db, card, fields);
    let previous = (await activeFor(card.id)).find((r) => r.provenance.field === "evidence[0]")!;

    for (const source of [{ source: "pilot receipts", date: "2026-09" }, { source: null, date: null }]) {
      fields.evidence![0] = { ...fields.evidence![0], ...source };
      currentCard = await applyPatch(db, currentCard, { evidence: fields.evidence });
      const current = (await activeFor(card.id)).find((r) => r.provenance.field === "evidence[0]")!;
      expect(current.text).toBe(previous.text);
      expect(current.id).not.toBe(previous.id);
      expect(current.provenance.source).toBe(source.source ?? undefined);
      expect(current.provenance.date).toBe(source.date ?? undefined);
      const [history] = await db.select().from(assertions).where(eq(assertions.id, previous.id));
      expect(history.supersededBy).toBe(current.id);
      previous = current;
    }

    fields.facets!.offering_type = null;
    fields.facets!.segment.industry_group = null;
    fields.facets!.segment.buyer_role = null;
    fields.facets!.segment.org_size = null;
    fields.kill_assumption!.falsifiable = null;
    await applyPatch(db, currentCard, { facets: fields.facets, kill_assumption: fields.kill_assumption });
    const after = await activeFor(card.id);
    expect(after.find((r) => r.provenance.field === "offering")!.provenance.enums).toBeUndefined();
    expect(after.find((r) => r.provenance.field === "segment.description")!.provenance.enums).toBeUndefined();
    expect(after.find((r) => r.provenance.field === "kill_assumption.assumption")!.provenance.falsifiable).toBeUndefined();
    expect(await applyCanvas(db, card.id, "unchanged-removals")).toMatchObject({ inserted: 0, superseded: 0, retired: 0 });
  });

  it("a facet that becomes stated supersedes its own not_stated row", async () => {
    const { card } = await seed("apply-facet@example.edu");
    await applyCanvas(db, card.id, "patch-1");
    const absent = (await activeFor(card.id)).find((r) => r.facet === "evidence")!;
    expect(absent.text).toBe("not_stated");

    const patched = await applyPatch(db, (await getCard(db, card.id))!, {
      evidence: [{ text: "spoke to 11 dentists", evidence_type: "observed_behavior", source: null, date: null }],
    });
    await applyCanvas(db, patched.id, "patch-2");

    const [old] = await db.select().from(assertions).where(eq(assertions.id, absent.id));
    expect(old.status).toBe("superseded");
    const filed = (await activeFor(card.id)).find((r) => r.facet === "evidence")!;
    expect(old.supersededBy).toBe(filed.id);
    expect(filed.text).toBe("spoke to 11 dentists");
    expect(filed.evidenceType).toBe("observed_behavior");
    expect(filed.embedding).toBeNull(); // no key in test; the row is written anyway
  });

  it("a field that empties its facet is superseded by that facet's absence", async () => {
    const { card } = await seed("apply-cleared@example.edu");
    const patched = await applyPatch(db, card, { value_proposition: "recovers $2,800/mo" });
    await applyCanvas(db, patched.id, "patch-1");
    const filed = (await activeFor(card.id)).find(
      (r) => (r.provenance as { field: string }).field === "value_proposition",
    )!;

    const cleared = await applyPatch(db, (await getCard(db, card.id))!, { value_proposition: null });
    await applyCanvas(db, cleared.id, "patch-2");

    const [row] = await db.select().from(assertions).where(eq(assertions.id, filed.id));
    expect(row.status).toBe("superseded");
    const absent = (await activeFor(card.id)).find((r) => r.facet === "purpose")!;
    expect(absent.text).toBe("not_stated");
    expect(row.supersededBy).toBe(absent.id);
  });

  it("a field that empties while its facet stays stated is superseded with no successor", async () => {
    const { card } = await seed("apply-orphan@example.edu");
    const facets = {
      one_liner: null,
      offering_type: null,
      business_model: null,
      segment: { industry: null, industry_group: null, buyer_role: null, org_size: null, geography: null },
      jtbd: { verb: null, object: null, context: null },
      quadrant: null,
      founder_intent: [],
      keywords: ["dental", "waitlist"],
    };
    const patched = await applyPatch(db, card, {
      segment: {
        description: "owner-dentists at single-location US practices",
        findability_evidence: null,
        homogeneity_claim: null,
        size_estimate: null,
        four_question_test: null,
        refinement: null,
      },
      facets,
    });
    await applyCanvas(db, patched.id, "patch-1");
    const keywords = (await activeFor(card.id)).find(
      (r) => (r.provenance as { field: string }).field === "facets.keywords",
    )!;

    // The keywords go; `segment.description` keeps `domain` stated, so there
    // is no absence row for this one to become.
    const cleared = await applyPatch(db, (await getCard(db, card.id))!, {
      facets: { ...facets, keywords: [] },
    });
    await applyCanvas(db, cleared.id, "patch-2");

    const [row] = await db.select().from(assertions).where(eq(assertions.id, keywords.id));
    expect(row.status).toBe("superseded");
    expect(row.supersededBy).toBeNull();
    expect((row.provenance as Record<string, unknown>).superseded_reason).toBe("field_cleared");
  });

  it("a second card repeating the first's unfair advantage upgrades it", async () => {
    const personId = await ensurePerson(db, { name: "Two cards", email: "two-cards@example.edu" });
    const sessionId = await createSession(db, personId);
    const one = await createCard(db, { sessionId, door: "blank" });
    const two = await createCard(db, { sessionId, door: "blank" });
    const advantage = { background: null, unfair_advantages: ["ran dental procurement for four years"] };

    await applyCanvas(db, (await applyPatch(db, one, { founder_context: advantage })).id, "patch-1");
    const first = (
      await db
        .select()
        .from(assertions)
        .where(and(eq(assertions.subjectId, personId), eq(assertions.facet, "mechanism_commanded")))
    )[0];
    expect(first.confidence).toBe("extracted");

    await applyCanvas(db, (await applyPatch(db, two, { founder_context: advantage })).id, "patch-2");

    const rows = await db
      .select()
      .from(assertions)
      .where(and(eq(assertions.subjectId, personId), eq(assertions.facet, "mechanism_commanded")));
    expect(rows).toHaveLength(2);
    const prior = rows.find((r) => r.id === first.id)!;
    const echo = rows.find((r) => r.id !== first.id)!;
    expect(prior.confidence).toBe("repeated");
    expect((echo.provenance as { echoes?: string[] }).echoes).toEqual([first.id]);
    expect(await personOf(db, two.id)).toBe(personId);
  });

  it("a card whose session has no person writes no person rows", async () => {
    const { card } = await seed("apply-legacy@example.edu");
    // The card has a person; strip the mapping the adapter reads.
    const rows = canvasAssertions({ ...EMPTY_FIELDS, founder_context: { background: "x", unfair_advantages: ["y"] } }, null);
    expect(rows.some((r) => r.subjectType === "person")).toBe(false);
    await applyCanvas(db, card.id, "patch-1");
    expect((await activeFor(card.id)).every((r) => r.subjectType === "idea")).toBe(true);
  });
});
