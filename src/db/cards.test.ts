import { beforeAll, describe, expect, it, vi } from "vitest";
import { ensurePerson } from "@/harness/ledger";
import { createPgliteDb, type Db } from "./client";
import {
  applyPatch,
  createCard,
  createDocument,
  createSession,
  fieldsOf,
  getCardBySlug,
  listStageEvents,
  writeStageEvent,
} from "./cards";

let db: Db;
let sessionId: string;

beforeAll(async () => {
  db = await createPgliteDb();
  sessionId = await createSession(db, await ensurePerson(db, { name: "Cards", email: "cards@example.edu" }));
});

describe("createCard", () => {
  it("makes a valid empty draft with the door in provenance", async () => {
    const card = await createCard(db, { sessionId, door: "blank" });
    expect(card.status).toBe("draft");
    expect(card.slug).toHaveLength(10);
    expect(card.provenance).toEqual({ source: "chat", doc_id: null });
    expect(fieldsOf(card).offering).toBeNull();
    expect(await getCardBySlug(db, card.slug)).toMatchObject({ id: card.id });
  });

  it("links door material as a document", async () => {
    const docId = await createDocument(db, { sessionId, source: "deck", title: "deck", text: "slide 1" });
    const card = await createCard(db, { sessionId, door: "deck", docId, ideaText: "slide 1" });
    expect(card.provenance).toEqual({ source: "deck", doc_id: docId });
    expect(card.status).toBe("draft");
  });
});

describe("applyPatch", () => {
  it("merges against the stored draft when the caller holds an older card", async () => {
    const original = await createCard(db, { sessionId, door: "blank" });
    await applyPatch(db, original, { offering: "The latest offering" });
    await applyPatch(db, original, { value_proposition: "A later independent correction" });
    expect(await getCardBySlug(db, original.slug)).toMatchObject({ offering: "The latest offering", valueProposition: "A later independent correction" });
  });

  it("rolls back the card if assertion synchronization fails", async () => {
    const original = await createCard(db, { sessionId, door: "blank" });
    const canvas = await import("@/harness/founder/canvas");
    const write = vi.spyOn(canvas, "applyCanvas").mockRejectedValueOnce(new Error("ledger unavailable"));
    try {
      await expect(applyPatch(db, original, { offering: "must not survive" })).rejects.toThrow("ledger unavailable");
      expect((await getCardBySlug(db, original.slug))?.offering).toBeNull();
    } finally {
      write.mockRestore();
    }
  });

  it("stores a partial group and derives status", async () => {
    const card = await createCard(db, { sessionId, door: "blank", ideaText: "DentalKeep" });
    const next = await applyPatch(db, card, {
      offering: "a $349/mo SaaS that fills cancelled slots from an SMS waitlist",
      segment: {
        description: "owner-dentists at single-location US practices",
        findability_evidence: null,
        homogeneity_claim: null,
        size_estimate: null,
        four_question_test: null,
        refinement: null,
      },
      value_proposition: "recovers ~$2,800/mo in no-show revenue",
    });
    expect(next.status).toBe("gated");
    expect(next.segment?.description).toMatch(/owner-dentists/);
    expect(next.segment?.four_question_test).toBeNull();
  });

  it("rejects an unknown key and writes nothing", async () => {
    const card = await createCard(db, { sessionId, door: "blank" });
    await expect(applyPatch(db, card, { offerings: "x" })).rejects.toThrow();
    expect((await getCardBySlug(db, card.slug))?.offering).toBeNull();
  });

  it("rejects a facets value outside the vocabulary", async () => {
    const card = await createCard(db, { sessionId, door: "blank" });
    await expect(
      applyPatch(db, card, {
        facets: {
          one_liner: null, offering_type: null, business_model: null,
          segment: { industry: null, industry_group: null, buyer_role: null, org_size: null, geography: null },
          jtbd: { verb: null, object: null, context: null },
          quadrant: "aspirin", founder_intent: [], keywords: [],
        },
      }),
    ).rejects.toThrow();
  });
});

describe("stage events", () => {
  it("append in order", async () => {
    const card = await createCard(db, { sessionId, door: "blank" });
    const base = {
      sessionId, cardId: card.id, stage: "intake" as const, userInputRaw: "hi",
      gateResult: "fail" as const, promptVersion: "v", model: "fake", reply: "?",
    };
    await writeStageEvent(db, { ...base, failReason: "invalid_output" });
    await writeStageEvent(db, { ...base, gateResult: "pass", extractedFields: { idea_text: "x" } });
    const events = await listStageEvents(db, card.id);
    expect(events.map((e) => e.gateResult)).toEqual(["fail", "pass"]);
    expect(events[0].extractedFields).toEqual({});
  });
});
