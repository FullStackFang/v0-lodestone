import { beforeAll, describe, expect, it, vi } from "vitest";
import { getDb, type Db } from "@/db/client";
import { createCard, createSession } from "@/db/cards";
import { ensurePerson } from "@/harness/ledger";
import { CardFields, type CardPatch } from "@/schema/card";
import fixture from "../../evals/harness/founder/canvas-fixture.json";
import { POST } from "@/app/api/cards/[id]/turn/route";
import { enrollTestMember } from "@/pilot/test-fixtures";

const current = vi.hoisted(() => ({ sessionId: "", patch: {} as CardPatch }));
vi.mock("@/lib/session", () => ({
  sessionIdFromCookie: async () => current.sessionId,
  ownedByPerson: async (_db: unknown, row: { sessionId: string }, sessionId: string) => row.sessionId === sessionId,
}));
vi.mock("@/engine/models", () => ({ defaultModel: () => async () => ({ output: { reply: "Recorded.", patch: current.patch, proposed_gate: { stage: "intake", result: "pass", reason: "" }, confidence: 0.8, questions_left: 0 }, model: "route-test", usage: {} }) }));
vi.mock("next/server", async (original) => ({ ...await original<typeof import("next/server")>(), after: () => {} }));

let db: Db;
beforeAll(async () => {
  db = await getDb();
  const personId = await ensurePerson(db, { name: "Route author", email: "turn-route@example.edu" });
  await enrollTestMember(db, personId);
  current.sessionId = await createSession(db, personId);
});

async function turn() {
  const card = await createCard(db, { sessionId: current.sessionId, door: "blank" });
  const response = await POST(new Request("http://localhost/api/cards/turn", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: "A dental appointment waitlist" }) }), { params: Promise.resolve({ id: card.id }) });
  expect(response.status).toBe(200);
  return { card, body: await response.json() };
}

describe("turn continuation URLs", () => {
  it("always exposes an owner workspace URL while a draft is incomplete", async () => {
    current.patch = {};
    const { card, body } = await turn();
    expect(body.status).toBe("draft");
    expect(body.workspaceUrl).toBe(`/ideas/${card.id}`);
    expect(body.shareUrl).toBeNull();
  });

  it("completion points to explicit publication instead of an unpublished public card", async () => {
    const full = CardFields.parse(fixture.cards[0].fields);
    current.patch = { ...full, segment: { ...full.segment!, four_question_test: { list_100_prospects: "yes", share_top_need: "yes", one_gtm_reaches: "yes", can_afford: "yes" } } };
    const { card, body } = await turn();
    expect(body.status).toBe("complete");
    expect(body.shareUrl).toBe(`/ideas/${card.id}/publish`);
    expect(body.workspaceUrl).toBe(`/ideas/${card.id}`);
  });

  it("rejects a direct model-turn request from a verified nonmember", async () => {
    const activeSession = current.sessionId;
    const nonmemberId = await ensurePerson(db, { name: "Former member", email: "former-turn-route@example.edu" });
    current.sessionId = await createSession(db, nonmemberId);
    const card = await createCard(db, { sessionId: current.sessionId, door: "blank" });
    const response = await POST(new Request("http://localhost/api/cards/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "Try to continue" }),
    }), { params: Promise.resolve({ id: card.id }) });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "active pilot membership required" });
    current.sessionId = activeSession;
  });
});
