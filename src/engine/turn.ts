/** One turn: the founder says something, the model proposes, the server
 *  disposes. Exactly one `stage_event` is written per call, whatever
 *  happened — that row is the product's asset, so a failed turn is a row
 *  too, not a log line.
 *
 *  The model function is injected so the engine's logic — merge, gate,
 *  retry, fallback, event — is tested without a key. The two real
 *  implementations are `api-model.ts` and `cli-model.ts`; `models.ts`
 *  picks. */
import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { CardPatch, type CardFields } from "@/schema/card";
import type { Db } from "@/db/client";
import { isActiveSessionMember } from "@/pilot/membership";
import { applyPatch, fieldsOf, getCard, listStageEvents, sameFounder, writeStageEvent } from "@/db/cards";
import type { StageEventRow, ThesisCardRow } from "@/db/schema";
import { deriveStage, gates } from "./gates";
import { assemblePrompt, fallbackQuestion, turnContext } from "./prompt";
import { STAGES, type Stage } from "./stages";

export const ProposedGate = z.object({
  stage: z.enum(STAGES),
  result: z.enum(["pass", "fail"]),
  reason: z.string(),
});

export const TurnOutput = z.object({
  reply: z.string().min(1),
  patch: CardPatch,
  proposed_gate: ProposedGate,
  confidence: z.number().min(0).max(1),
  questions_left: z.number().int().min(0),
});
export type TurnOutput = z.infer<typeof TurnOutput>;

export interface ModelRequest {
  system: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
}

export interface ModelResponse {
  /** Parsed and schema-valid, or a thrown error. */
  output: TurnOutput;
  model: string;
  usage: Record<string, unknown> | null;
}

export type ModelFn = (req: ModelRequest) => Promise<ModelResponse>;

export const DEFAULT_MODEL = "claude-opus-5";
export const DEFAULT_EFFORT = "medium";
/** Prior turns replayed to the model. The card carries the state; history
 *  is for tone and for not re-asking. Exported because the harness rebuilds
 *  the window a turn saw in order to extract from it. */
export const HISTORY_TURNS = 12;

export interface TurnResult {
  card: ThesisCardRow;
  event: StageEventRow;
  stage: Stage;
  reply: string;
  questionsLeft: number;
}

export class ForbiddenError extends Error {}

/** The thread as alternating messages, oldest first, capped. */
function history(events: StageEventRow[]): Anthropic.MessageParam[] {
  const recent = events.slice(-HISTORY_TURNS);
  const out: Anthropic.MessageParam[] = [];
  for (const e of recent) {
    out.push({ role: "user", content: e.userInputRaw });
    out.push({ role: "assistant", content: e.reply });
  }
  return out;
}

export async function runTurn(
  db: Db,
  input: {
    cardId: string;
    sessionId: string;
    userInput: string;
    model: ModelFn;
    /** Called once, at the tail, on every path, after the turn's
     *  `stage_event` row exists. The harness extracts from it; the route
     *  schedules that with `after()` so the turn's latency is its own.
     *  A throw here is the callback's problem, never the turn's. */
    afterCommit?: (eventId: string) => void | Promise<void>;
  },
): Promise<TurnResult> {
  const { model } = input;
  const card = await getCard(db, input.cardId);
  if (!card) throw new Error(`no card ${input.cardId}`);
  // The founder, not the browser: a card is editable from any session of the
  // same person.
  if (!(await sameFounder(db, card.sessionId, input.sessionId))) {
    throw new ForbiddenError("not your card");
  }
  if (!(await isActiveSessionMember(db, input.sessionId))) {
    throw new ForbiddenError("active pilot membership required");
  }

  const fields = fieldsOf(card);
  const stage = deriveStage(fields);
  const gateReason = gates[stage](fields).reason;
  const { system, promptVersion } = assemblePrompt(stage);
  const events = await listStageEvents(db, card.id);
  const messages: Anthropic.MessageParam[] = [
    ...history(events),
    { role: "user", content: turnContext({ stage, gateReason, fields, userInput: input.userInput }) },
  ];

  // Ask once; on a schema miss, once more with the error; then give up and
  // ask the founder the stage's fixed question instead.
  let response: ModelResponse | undefined;
  let lastError = "";
  for (let attempt = 0; attempt < 2 && !response; attempt++) {
    const req: ModelRequest =
      attempt === 0
        ? { system, messages }
        : {
            system,
            messages: [
              ...messages,
              { role: "user", content: `Your previous reply did not validate:\n${lastError}\nReply again, valid this time.` },
            ],
          };
    try {
      response = await model(req);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  if (!response) {
    const reply = fallbackQuestion(stage);
    const event = await writeStageEvent(db, {
      sessionId: card.sessionId,
      cardId: card.id,
      stage,
      userInputRaw: input.userInput,
      extractedFields: {},
      gateResult: "fail",
      failReason: `invalid_output: ${lastError.slice(0, 500)}`,
      proposedGate: null,
      modelConfidence: null,
      questionsLeft: null,
      promptVersion,
      model: process.env.THESIS_MODEL || DEFAULT_MODEL,
      usage: null,
      fallbackUsed: true,
      reply,
    });
    await commit(input.afterCommit, event.id);
    return { card, event, stage, reply, questionsLeft: 1 };
  }

  const { output } = response;
  // The intake gate is the founder's words, not the model's: file them here
  // so a first turn that only asks questions still passes intake.
  const patch: CardPatch = { ...output.patch };
  if (stage === "intake" && patch.idea_text === undefined && !fields.idea_text) patch.idea_text = input.userInput;

  // The event id is minted here so the canvas rows this patch writes can
  // name the turn that carried it before the row itself exists.
  const eventId = randomUUID();
  const next = await applyPatch(db, card, patch, eventId);
  const verdict = gates[stage](fieldsOf(next));
  const nextStage = deriveStage(fieldsOf(next));

  const event = await writeStageEvent(db, {
    id: eventId,
    sessionId: card.sessionId,
    cardId: card.id,
    stage,
    userInputRaw: input.userInput,
    extractedFields: patch,
    gateResult: verdict.pass ? "pass" : "fail",
    failReason: verdict.pass ? null : verdict.reason,
    proposedGate: output.proposed_gate,
    modelConfidence: output.confidence,
    questionsLeft: output.questions_left,
    promptVersion,
    model: response.model,
    usage: response.usage,
    fallbackUsed: false,
    reply: output.reply,
  });

  await commit(input.afterCommit, event.id);
  return { card: next, event, stage: nextStage, reply: output.reply, questionsLeft: output.questions_left };
}

/** The tail call, on both paths. A callback that throws must not turn a
 *  finished turn into a failed request: the harness records its own failure
 *  and the founder sees their reply either way. */
async function commit(fn: ((eventId: string) => void | Promise<void>) | undefined, eventId: string) {
  if (!fn) return;
  try {
    await fn(eventId);
  } catch {
    // Deliberately swallowed; the extraction's own run row carries the error.
  }
}

/** Where a card stands, for the UI: the derived stage and every gate's
 *  verdict. Pure over the row. */
export function standing(card: ThesisCardRow): { stage: Stage; fields: CardFields } {
  const fields = fieldsOf(card);
  return { stage: deriveStage(fields), fields };
}
