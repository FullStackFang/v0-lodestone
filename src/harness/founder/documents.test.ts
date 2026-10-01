import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { createCard, createDocument, createSession } from "@/db/cards";
import { artifactTexts, assertions } from "@/db/schema";
import { ensurePerson } from "@/harness/ledger";
import { getCanonicalText } from "@/harness/canonical";
import { ingestDocument } from "./documents";
import { scriptedStructured, said } from "./scripted";

let db: Db;

beforeAll(async () => {
  db = await createPgliteDb();
});

async function door(email: string, source: "deck" | "resume", text: string) {
  const personId = await ensurePerson(db, { name: email, email });
  const sessionId = await createSession(db, personId);
  const documentId = await createDocument(db, { sessionId, source, title: `${source}.md`, text });
  const card = await createCard(db, { sessionId, door: source, docId: documentId });
  return { personId, documentId, card };
}

const rowsFor = (runId: string) =>
  db.select().from(assertions).where(eq(assertions.extractionRunId, runId));

const RESUME = "Ran dental procurement for four years at a twelve-practice group. Shipped three iOS apps.";
const DECK =
  "Problem: practices lose revenue to same-day cancellations. Solution: an SMS waitlist. Traction: 10,000 users love us.";

describe("ingestDocument", () => {
  it("files a resume's bullets as the person's commanded mechanisms, with selectors", async () => {
    const { documentId, card, personId } = await door("resume@docs.edu", "resume", RESUME);
    const run = (await ingestDocument(db, documentId, card.id, {
      structured: scriptedStructured([
        {
          when: /dental procurement/,
          output: {
            assertions: [
              said("mechanism_commanded", "ran dental procurement for four years", "Ran dental procurement for four years", {
                subject: "person",
              }),
              said("mechanism_commanded", "shipped three iOS apps", "Shipped three iOS apps.", {
                subject: "person",
                prefix: "twelve-practice group.",
              }),
            ],
            // A resume is not expected to state a purpose, so its absence
            // is not on the record.
            not_stated: ["mechanism_sought"],
          },
        },
      ]),
    }))!;

    expect(run.status).toBe("ok");
    const rows = await rowsFor(run.id);
    const commanded = rows.filter((r) => r.facet === "mechanism_commanded");
    expect(commanded).toHaveLength(2);
    for (const row of commanded) {
      expect(row.subjectType).toBe("person");
      expect(row.subjectId).toBe(personId);
      expect(row.sourceType).toBe("resume");
      const canonical = (await getCanonicalText(db, row.textHash!))!;
      expect(canonical.slice(row.startOff!, row.endOff!)).toBe(row.quote);
    }
    expect(rows.some((r) => r.facet === "purpose")).toBe(false);
  });

  it("files a deck against the card, with revenue as a declared absence and traction as a claim", async () => {
    const { documentId, card } = await door("deck@docs.edu", "deck", DECK);
    const run = (await ingestDocument(db, documentId, card.id, {
      structured: scriptedStructured([
        {
          when: /same-day cancellations/,
          output: {
            assertions: [
              said("purpose", "stop losing revenue to same-day cancellations", "practices lose revenue to same-day cancellations"),
              said("mechanism.product", "an SMS waitlist", "an SMS waitlist"),
              said("evidence", "claims 10,000 users", "10,000 users love us", {
                evidence_type: "stated_opinion",
              }),
            ],
            not_stated: ["mechanism.revenue"],
          },
        },
      ]),
    }))!;

    const rows = await rowsFor(run.id);
    expect(rows.every((r) => r.subjectType === "idea" && r.subjectId === card.id)).toBe(true);
    const revenue = rows.find((r) => r.facet === "mechanism.revenue")!;
    expect(revenue.text).toBe("not_stated");
    expect(revenue.embedding).toBeNull();
    const traction = rows.find((r) => r.facet === "evidence")!;
    expect(traction.evidenceType).toBe("stated_opinion");
    expect(rows.find((r) => r.facet === "mechanism.product")!.sourceType).toBe("deck");
  });

  it("a sourced number is stronger than a claim", async () => {
    const text = "Traction: $42k ARR as of March (Stripe dashboard).";
    const { documentId, card } = await door("sourced@docs.edu", "deck", text);
    const run = (await ingestDocument(db, documentId, card.id, {
      structured: scriptedStructured([
        {
          when: /Stripe/,
          output: {
            assertions: [
              said("evidence", "$42k ARR in March", "$42k ARR as of March (Stripe dashboard)", {
                evidence_type: "incurred_cost",
                prefix: "Traction:",
              }),
            ],
            not_stated: [],
          },
        },
      ]),
    }))!;
    const [row] = await rowsFor(run.id);
    expect(row.evidenceType).toBe("incurred_cost");
  });

  it("the same text twice is one artifact_texts row and no second model call", async () => {
    const text = "Ran procurement for a hospital network for six years.";
    const first = await door("twice-a@docs.edu", "resume", text);
    let calls = 0;
    const script = scriptedStructured([
      {
        when: /hospital network/,
        output: {
          assertions: [
            said("mechanism_commanded", "ran hospital procurement", "Ran procurement for a hospital network", {
              subject: "person",
            }),
          ],
          not_stated: [],
        },
      },
    ]);
    const counting = (async (schema, request) => {
      calls += 1;
      return script(schema, request);
    }) as typeof script;

    const one = (await ingestDocument(db, first.documentId, first.card.id, { structured: counting }))!;
    expect(calls).toBe(1);

    const two = (await ingestDocument(db, first.documentId, first.card.id, { structured: counting }))!;
    expect(two.id).toBe(one.id);
    expect(calls).toBe(1);

    const texts = await db
      .select()
      .from(artifactTexts)
      .where(eq(artifactTexts.artifactId, first.documentId));
    expect(texts).toHaveLength(1);
  });

  it("ignores a source it has no variant for", async () => {
    const sessionId = await createSession(db, await ensurePerson(db, { name: "P", email: "paper@docs.edu" }));
    const documentId = await createDocument(db, { sessionId, source: "paper", title: null, text: "An abstract." });
    const card = await createCard(db, { sessionId, door: "blank" });
    expect(await ingestDocument(db, documentId, card.id)).toBeNull();
  });
});
