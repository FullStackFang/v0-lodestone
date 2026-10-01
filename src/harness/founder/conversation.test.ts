import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { createCard, createSession, writeStageEvent } from "@/db/cards";
import { artifactTexts, assertions, extractionRuns, type ThesisCardRow } from "@/db/schema";
import { ensurePerson } from "@/harness/ledger";
import type { RunStats } from "@/harness/schema";
import { assembleWindow, extractFromEvent } from "./conversation";
import { scriptedStructured, said } from "./scripted";

let db: Db;

beforeAll(async () => {
  db = await createPgliteDb();
});

let seq = 0;

async function founder(email: string) {
  const personId = await ensurePerson(db, { name: email, email });
  const sessionId = await createSession(db, personId);
  const card = await createCard(db, { sessionId, door: "blank" });
  return { personId, sessionId, card };
}

async function turn(card: ThesisCardRow, input: string) {
  return writeStageEvent(db, {
    sessionId: card.sessionId,
    cardId: card.id,
    stage: "thesis",
    userInputRaw: input,
    extractedFields: {},
    gateResult: "pass",
    promptVersion: `v${seq++}`,
    model: "fake",
    reply: "ok",
  });
}

const rowsFor = (runId: string) =>
  db.select().from(assertions).where(eq(assertions.extractionRunId, runId));

describe("assembleWindow", () => {
  it("joins oldest first and points at the newest turn", () => {
    const w = assembleWindow(["first", "second", "third"]);
    expect(w.text).toBe("first ¶ second ¶ third");
    expect(w.text.slice(w.newestAt)).toBe("third");
  });

  it("a single turn starts at zero", () => {
    expect(assembleWindow(["only"])).toEqual({ text: "only", newestAt: 0 });
  });
});

describe("extractFromEvent", () => {
  it("files the newest turn and drops what an older one said", async () => {
    const { card, personId } = await founder("window@conv.edu");
    await turn(card, "I ran procurement for four years.");
    const second = await turn(card, "We charge $349 a month.");

    const run = (await extractFromEvent(db, second.id, {
      structured: scriptedStructured([
        {
          when: /procurement/,
          output: {
            assertions: [
              said("mechanism.revenue", "charges $349 a month", "We charge $349 a month.", {
                prefix: "for four years. ¶",
              }),
              // The same window still carries turn one, and the model quotes it.
              said("mechanism_commanded", "ran procurement for four years", "I ran procurement for four years.", {
                subject: "person",
              }),
            ],
            not_stated: [],
          },
        },
      ]),
    }))!;

    expect(run.status).toBe("ok");
    const rows = await rowsFor(run.id);
    expect(rows.map((r) => r.text)).toEqual(["charges $349 a month"]);
    expect((run.stats as RunStats).outside_window).toBe(1);
    expect(rows[0].subjectId).toBe(card.id);
    expect(personId).toBeTruthy();
  });

  it("clamps a commanded mechanism onto the person and a domain onto the card", async () => {
    const { card, personId } = await founder("clamp@conv.edu");
    const only = await turn(card, "I have shipped three iOS apps and we sell into dental practices.");

    const run = (await extractFromEvent(db, only.id, {
      structured: scriptedStructured([
        {
          when: /shipped three/,
          output: {
            assertions: [
              // The model gets the subject wrong in both directions.
              said("mechanism_commanded", "shipped three iOS apps", "I have shipped three iOS apps", {
                subject: "idea",
              }),
              said("domain", "dental practices", "we sell into dental practices", {
                subject: "person",
                prefix: "iOS apps and",
              }),
            ],
            not_stated: [],
          },
        },
      ]),
    }))!;

    const rows = await rowsFor(run.id);
    const commanded = rows.find((r) => r.facet === "mechanism_commanded")!;
    const domain = rows.find((r) => r.facet === "domain")!;
    expect(commanded.subjectType).toBe("person");
    expect(commanded.subjectId).toBe(personId);
    expect(domain.subjectType).toBe("idea");
    expect(domain.subjectId).toBe(card.id);
  });

  it("puts the commitment month on the person's constraint", async () => {
    const { card, personId } = await founder("commit@conv.edu");
    const only = await turn(card, "Full-time from June, but I need a visa.");

    const run = (await extractFromEvent(db, only.id, {
      structured: scriptedStructured([
        {
          when: /visa/,
          output: {
            assertions: [
              said("constraint", "needs a visa to go full-time", "Full-time from June, but I need a visa.", {
                subject: "person",
              }),
            ],
            not_stated: [],
            derived: { commitment: { available_from: "2027-06", note: "needs a visa" } },
          },
        },
      ]),
    }))!;

    const [row] = await rowsFor(run.id);
    expect(row.subjectType).toBe("person");
    expect(row.subjectId).toBe(personId);
    expect(row.provenance).toMatchObject({ kind: "commitment", available_from: "2027-06", note: "needs a visa" });
  });

  it("files first-person action as the person's evidence", async () => {
    const { card, personId } = await founder("evidence@conv.edu");
    const only = await turn(card, "I've talked to eleven dentists this month.");

    const run = (await extractFromEvent(db, only.id, {
      structured: scriptedStructured([
        {
          when: /eleven dentists/,
          output: {
            assertions: [
              said("evidence", "talked to eleven dentists", "I've talked to eleven dentists", {
                subject: "person",
                evidence_type: "observed_behavior",
              }),
            ],
            not_stated: [],
          },
        },
      ]),
    }))!;

    const [row] = await rowsFor(run.id);
    expect(row.subjectType).toBe("person");
    expect(row.subjectId).toBe(personId);
    expect(row.evidenceType).toBe("observed_behavior");
  });

  it("one utterance in two windows is one row", async () => {
    const { card } = await founder("twice@conv.edu");
    const first = await turn(card, "We charge $349 a month.");
    const script = scriptedStructured([
      {
        when: /\$349/,
        output: {
          assertions: [said("mechanism.revenue", "charges $349 a month", "We charge $349 a month.")],
          not_stated: [],
        },
      },
    ]);

    const one = (await extractFromEvent(db, first.id, { structured: script }))!;
    const second = await turn(card, "Anyway, that is the plan.");
    const two = (await extractFromEvent(db, second.id, { structured: script }))!;

    expect((await rowsFor(one.id))).toHaveLength(1);
    expect((await rowsFor(two.id))).toHaveLength(0);
    expect((two.stats as RunStats).outside_window).toBe(1);

    const all = await db
      .select()
      .from(assertions)
      .where(and(eq(assertions.subjectId, card.id), eq(assertions.facet, "mechanism.revenue")));
    expect(all.filter((r) => r.text === "charges $349 a month")).toHaveLength(1);
  });

  it("the same claim in a different turn upgrades the first row", async () => {
    const { card, personId } = await founder("repeat@conv.edu");
    const first = await turn(card, "I have shipped three iOS apps.");
    const one = (await extractFromEvent(db, first.id, {
      structured: scriptedStructured([
        {
          when: /shipped three iOS apps\.$/,
          output: {
            assertions: [
              said("mechanism_commanded", "shipped three iOS apps", "I have shipped three iOS apps.", {
                subject: "person",
              }),
            ],
            not_stated: [],
          },
        },
      ]),
    }))!;
    const [prior] = await rowsFor(one.id);
    expect(prior.confidence).toBe("extracted");

    const second = await turn(card, "Like I said, I have shipped three iOS apps.");
    const two = (await extractFromEvent(db, second.id, {
      structured: scriptedStructured([
        {
          when: /Like I said/,
          output: {
            assertions: [
              said("mechanism_commanded", "shipped three iOS apps", "Like I said, I have shipped three iOS apps.", {
                subject: "person",
                reason: "recurring",
              }),
            ],
            not_stated: [],
          },
        },
      ]),
    }))!;

    const [echo] = await rowsFor(two.id);
    const [refreshed] = await db.select().from(assertions).where(eq(assertions.id, prior.id));
    expect(refreshed.confidence).toBe("repeated");
    expect((echo.provenance as { echoes?: string[] }).echoes).toEqual([prior.id]);
    expect(echo.subjectId).toBe(personId);
    expect((two.stats as RunStats).repeats).toBe(1);
  });

  it("a legacy session drops the person's rows and counts them", async () => {
    // A card whose session never named a founder: the only way to have one
    // is to write it as the app did before the person step existed.
    const sessionId = await createSession(db);
    const [card] = await db
      .insert((await import("@/db/schema")).thesisCard)
      .values({ sessionId, slug: `legacy-${seq++}`, provenance: { source: "chat", doc_id: null } })
      .returning();
    const only = await turn(card, "I ran procurement for four years.");

    const run = (await extractFromEvent(db, only.id, {
      structured: scriptedStructured([
        {
          when: /procurement/,
          output: {
            assertions: [
              said("mechanism_commanded", "ran procurement", "I ran procurement for four years.", {
                subject: "person",
              }),
            ],
            not_stated: [],
          },
        },
      ]),
    }))!;

    expect(await rowsFor(run.id)).toHaveLength(0);
    expect((run.stats as RunStats).no_person).toBe(1);
  });

  it("writes one artifact_texts row and one ok run for one window", async () => {
    const { card } = await founder("idempotent@conv.edu");
    // A text no other test uses: `artifact_texts` is keyed by hash, so two
    // events that say exactly the same thing share one row by design.
    const only = await turn(card, "We bill $1,290 a quarter, paid up front.");
    const script = scriptedStructured([
      {
        when: /1,290/,
        output: {
          assertions: [
            said("mechanism.revenue", "bills $1,290 a quarter", "We bill $1,290 a quarter, paid up front."),
          ],
          not_stated: [],
        },
      },
    ]);

    const one = (await extractFromEvent(db, only.id, { structured: script }))!;
    const two = (await extractFromEvent(db, only.id, { structured: script }))!;
    expect(two.id).toBe(one.id);

    const texts = await db.select().from(artifactTexts).where(eq(artifactTexts.artifactId, only.id));
    expect(texts).toHaveLength(1);
    const runs = await db.select().from(extractionRuns).where(eq(extractionRuns.textHash, texts[0].textHash));
    expect(runs.filter((r) => r.status === "ok")).toHaveLength(1);
  });
});
