import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { createCard, createSession, getCard, listStageEvents } from "@/db/cards";
import { ensurePerson } from "@/harness/ledger";
import { enrollTestMember } from "@/pilot/test-fixtures";
import { RUBRIC_FACTORS, type CardPatch } from "@/schema/card";
import { ForbiddenError, runTurn, type ModelFn, type TurnOutput } from "./turn";

let db: Db;
let sessionId: string;

beforeAll(async () => {
  db = await createPgliteDb();
  const personId = await ensurePerson(db, { name: "Turn", email: "turn@example.edu" });
  await enrollTestMember(db, personId);
  sessionId = await createSession(db, personId);
});

/** A model that returns the given outputs in order and records every request. */
function fakeModel(outputs: (TurnOutput | Error)[]) {
  const calls: Parameters<ModelFn>[0][] = [];
  const fn: ModelFn = async (req) => {
    calls.push(req);
    const next = outputs.shift();
    if (!next) throw new Error("fake model: no more outputs");
    if (next instanceof Error) throw next;
    return { output: next, model: "fake", usage: { input_tokens: 1, output_tokens: 1 } };
  };
  return { fn, calls };
}

const out = (patch: CardPatch, over: Partial<TurnOutput> = {}): TurnOutput => ({
  reply: "ok",
  patch,
  proposed_gate: { stage: "intake", result: "pass", reason: "" },
  confidence: 0.8,
  questions_left: 1,
  ...over,
});

const segment = {
  description: "owner-dentists at single-location US practices",
  findability_evidence: "state license registry",
  homogeneity_claim: null,
  size_estimate: null,
  four_question_test: null,
  refinement: null,
};

const richPatch: CardPatch = {
  idea_text: "DentalKeep",
  offering: "a $349/mo SaaS that fills cancelled slots from an SMS waitlist",
  segment: { ...segment, four_question_test: { list_100_prospects: "yes", share_top_need: "yes", one_gtm_reaches: "yes", can_afford: "yes" } },
  value_proposition: "recovers ~$2,800/mo in no-show revenue",
  jtbd: { job_statement: "keep the chairs full", functional: null, emotional: null, social: null, current_workaround: "front desk calls", passes_member_test: true },
  economic_buyer: { role: "owner-dentist", distinct_from_end_user: true, budget_evidence: "pays $300/mo for reminder texts" },
};

const rubric = Object.fromEntries(
  RUBRIC_FACTORS.map((k) => [k, { score: 3, confidence: "low", rationale: "r", evidence_type: "model_inference" }]),
) as CardPatch["rubric_scores"];

const kill: CardPatch["kill_assumption"] = {
  assumption: "practices lose ≥10% of revenue to no-shows",
  falsifiable: true,
  cheapest_test: { description: "pull 10 schedules", days: 7, kill_criterion: "median no-show < 5%" },
};

describe("runTurn", () => {
  it("passes several gates in one turn and records the turn at the stage it began", async () => {
    const card = await createCard(db, { sessionId, door: "blank" });
    const { fn } = fakeModel([out(richPatch)]);
    const r = await runTurn(db, { cardId: card.id, sessionId, userInput: "DentalKeep pitch", model: fn });
    expect(r.stage).toBe("rubric");
    expect(r.card.status).toBe("gated");
    expect(r.event.stage).toBe("intake");
    expect(r.event.gateResult).toBe("pass");
    expect(r.event.promptVersion).toMatch(/^[0-9a-f]{64}$/);
    expect(await listStageEvents(db, card.id)).toHaveLength(1);
  });

  it("the server verdict overrides the model's claim", async () => {
    const card = await createCard(db, { sessionId, door: "blank", ideaText: "x" });
    // Model files a vague thesis and claims the gate passed.
    const { fn } = fakeModel([
      out(
        { offering: "a platform", segment, value_proposition: "saves time" },
        { proposed_gate: { stage: "thesis", result: "pass", reason: "looks good" } },
      ),
    ]);
    const r = await runTurn(db, { cardId: card.id, sessionId, userInput: "hi", model: fn });
    expect(r.stage).toBe("thesis");
    expect(r.event.gateResult).toBe("fail");
    expect(r.event.failReason).toMatch(/^offering/);
    expect(r.event.proposedGate).toEqual({ stage: "thesis", result: "pass", reason: "looks good" });
  });

  it("files the founder's words as idea_text on the first turn even if the model only asks", async () => {
    const card = await createCard(db, { sessionId, door: "blank" });
    const { fn } = fakeModel([out({}, { reply: "who, specifically?" })]);
    const r = await runTurn(db, { cardId: card.id, sessionId, userInput: "an app for small businesses", model: fn });
    expect(r.card.ideaText).toBe("an app for small businesses");
    expect(r.event.gateResult).toBe("pass");
    expect(r.stage).toBe("thesis");
  });

  it("retries once with the error, then asks the fallback question", async () => {
    const card = await createCard(db, { sessionId, door: "blank", ideaText: "x" });
    const { fn, calls } = fakeModel([new Error("bad json"), new Error("still bad")]);
    const r = await runTurn(db, { cardId: card.id, sessionId, userInput: "hi", model: fn });
    expect(calls).toHaveLength(2);
    expect(JSON.stringify(calls[1].messages.at(-1))).toContain("bad json");
    expect(r.reply).toMatch(/^Which of these is least settled/);
    expect(r.event.gateResult).toBe("fail");
    expect(r.event.failReason).toMatch(/^invalid_output/);
    expect(r.event.fallbackUsed).toBe(true);
    expect(r.event.extractedFields).toEqual({});
    expect((await getCard(db, card.id))?.offering).toBeNull();
  });

  it("recovers on the retry", async () => {
    const card = await createCard(db, { sessionId, door: "blank" });
    const { fn } = fakeModel([new Error("bad"), out(richPatch)]);
    const r = await runTurn(db, { cardId: card.id, sessionId, userInput: "pitch", model: fn });
    expect(r.event.fallbackUsed).toBe(false);
    expect(r.stage).toBe("rubric");
  });

  it("walks draft → gated → complete and one event per turn", async () => {
    const card = await createCard(db, { sessionId, door: "blank" });
    const { fn } = fakeModel([
      out({ idea_text: "DentalKeep" }),
      out(richPatch),
      out({ rubric_scores: rubric, kill_assumption: kill }, { questions_left: 0 }),
    ]);
    const a = await runTurn(db, { cardId: card.id, sessionId, userInput: "1", model: fn });
    expect(a.card.status).toBe("draft");
    const b = await runTurn(db, { cardId: card.id, sessionId, userInput: "2", model: fn });
    expect(b.card.status).toBe("gated");
    const c = await runTurn(db, { cardId: card.id, sessionId, userInput: "3", model: fn });
    expect(c.card.status).toBe("complete");
    expect(c.stage).toBe("render");
    expect(c.event.stage).toBe("rubric");
    expect(await listStageEvents(db, card.id)).toHaveLength(3);
  });

  it("replays the thread and the card to the model", async () => {
    const card = await createCard(db, { sessionId, door: "blank" });
    const { fn, calls } = fakeModel([out({ idea_text: "first" }, { reply: "first reply" }), out({})]);
    await runTurn(db, { cardId: card.id, sessionId, userInput: "first", model: fn });
    await runTurn(db, { cardId: card.id, sessionId, userInput: "second", model: fn });
    const msgs = calls[1].messages;
    expect(msgs).toHaveLength(3);
    expect(msgs[1]).toEqual({ role: "assistant", content: "first reply" });
    expect(String(msgs[2].content)).toContain('"idea_text": "first"');
    expect(String(msgs[2].content)).toContain("Open at `thesis`");
    expect(calls[1].system[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("calls afterCommit once with the event's id", async () => {
    const card = await createCard(db, { sessionId, door: "blank" });
    const { fn } = fakeModel([out({ idea_text: "DentalKeep" })]);
    const seen: string[] = [];
    const r = await runTurn(db, {
      cardId: card.id,
      sessionId,
      userInput: "1",
      model: fn,
      afterCommit: (id) => void seen.push(id),
    });
    expect(seen).toEqual([r.event.id]);
  });

  it("calls afterCommit on the fallback path too", async () => {
    const card = await createCard(db, { sessionId, door: "blank", ideaText: "x" });
    const { fn } = fakeModel([new Error("bad"), new Error("still bad")]);
    const seen: string[] = [];
    const r = await runTurn(db, {
      cardId: card.id,
      sessionId,
      userInput: "hi",
      model: fn,
      afterCommit: (id) => void seen.push(id),
    });
    expect(r.event.fallbackUsed).toBe(true);
    expect(seen).toEqual([r.event.id]);
  });

  it("a throwing afterCommit does not change the turn", async () => {
    const card = await createCard(db, { sessionId, door: "blank" });
    const { fn } = fakeModel([out({ idea_text: "DentalKeep" }, { reply: "unchanged" })]);
    const r = await runTurn(db, {
      cardId: card.id,
      sessionId,
      userInput: "1",
      model: fn,
      afterCommit: () => {
        throw new Error("extraction exploded");
      },
    });
    expect(r.reply).toBe("unchanged");
    expect(await listStageEvents(db, card.id)).toHaveLength(1);
  });

  it("refuses another session", async () => {
    const card = await createCard(db, { sessionId, door: "blank" });
    const other = await createSession(db);
    const { fn } = fakeModel([out({})]);
    await expect(runTurn(db, { cardId: card.id, sessionId: other, userInput: "hi", model: fn })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await listStageEvents(db, card.id)).toHaveLength(0);
  });
});
