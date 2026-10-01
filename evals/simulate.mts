/** Founder-bot vs the engine. `npm run eval -- <scenario>` (default:
 *  greenloop; `all` runs every scenario). Drives `runTurn()` directly on an
 *  in-memory PGlite — no HTTP, no service — until the card completes or the
 *  scenario's turn cap. Prints the transcript, turns-to-card, per-turn
 *  usage, and how often the model's proposed gate disagreed with the
 *  server's verdict. Exit code 1 if any expectation fails.
 *
 *  The founder side runs on Haiku 4.5 — cheap by design — through whichever
 *  engine the app itself is using (CLI when there is no key). */
process.env.VITEST ??= "1"; // in-memory PGlite, uncached prompt files

import Anthropic from "@anthropic-ai/sdk";
import { createPgliteDb } from "../src/db/client";
import { createCard, createSession, fieldsOf, getCard, listStageEvents } from "../src/db/cards";
import { runClaudeCli } from "../src/engine/cli-model";
import { defaultModel, engineKind } from "../src/engine/models";
import { runTurn } from "../src/engine/turn";
import { extractFromEvent } from "../src/harness/founder/conversation";
import { ensurePerson } from "../src/harness/ledger";
import { SCENARIOS, type RunSummary, type Scenario } from "./scenarios";

const FOUNDER_MODEL = "claude-haiku-4-5";
const BAR = "=".repeat(74);

let api: Anthropic | undefined;

async function founderReply(persona: string, transcript: { role: "founder" | "forge"; text: string }[]): Promise<string> {
  const prompt =
    transcript.map((t) => `${t.role === "founder" ? "YOU (founder)" : "ADVISOR"}:\n${t.text}`).join("\n\n") +
    "\n\nYOU (founder):";
  if (engineKind() === "cli") {
    const env = await runClaudeCli({ system: persona, prompt, model: FOUNDER_MODEL });
    return String(env.result ?? "").trim();
  }
  api ??= new Anthropic();
  const res = await api.messages.create({
    model: FOUNDER_MODEL,
    max_tokens: 400,
    system: persona,
    messages: [{ role: "user", content: prompt }],
  });
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}

async function runScenario(s: Scenario): Promise<boolean> {
  const db = await createPgliteDb();
  const sessionId = await createSession(
    db,
    await ensurePerson(db, { name: `${s.name} founder`, email: `${s.name}@evals.local` }),
  );
  const card = await createCard(db, { sessionId, door: "blank" });
  const model = defaultModel();
  const transcript: { role: "founder" | "forge"; text: string }[] = [];

  console.log(`${BAR}\nSCENARIO: ${s.name}   engine: ${engineKind()}   model: ${process.env.THESIS_MODEL ?? "(default)"}\n${BAR}`);
  let input = s.seed;
  let complete = false;
  let turns = 0;
  let disagreements = 0;

  for (let i = 0; i < s.maxTurns && !complete; i++) {
    turns = i + 1;
    console.log(`FOUNDER:\n${input}\n`);
    transcript.push({ role: "founder", text: input });
    const t0 = Date.now();
    const r = await runTurn(db, {
      cardId: card.id,
      sessionId,
      userInput: input,
      model,
      // Awaited, not scheduled: the harness wants the assertions on the
      // record before the founder-bot speaks again.
      afterCommit: async (eventId) => {
        await extractFromEvent(db, eventId);
      },
    });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const u = (r.event.usage ?? {}) as Record<string, number>;
    const usage = r.event.usage ? `in ${u.input_tokens ?? "?"} · cached ${u.cache_read_input_tokens ?? 0} · out ${u.output_tokens ?? "?"}` : "usage unknown";
    const proposed = r.event.proposedGate as { result?: string } | null;
    const disagreed = proposed && proposed.result !== r.event.gateResult;
    if (disagreed) disagreements++;
    console.log(`${BAR}\nTHESIS FORGE  (turn ${turns}, ${secs}s, ${usage})`);
    console.log(
      `[${r.event.stage} gate ${r.event.gateResult}${r.event.failReason ? ` — ${r.event.failReason}` : ""}` +
        `${disagreed ? ` · model claimed ${proposed?.result}` : ""} · now at ${r.stage} · ${r.card.status}]`,
    );
    console.log(`${r.reply}\n`);
    transcript.push({ role: "forge", text: r.reply });
    complete = r.card.status === "complete";
    if (!complete && i + 1 < s.maxTurns) input = await founderReply(s.persona, transcript);
  }

  const events = await listStageEvents(db, card.id);
  const summary: RunSummary = { fields: fieldsOf((await getCard(db, card.id))!), events, complete, turns };
  const failures = s.expectations.map((e) => e(summary)).filter((m): m is string => m !== null);

  console.log(BAR);
  console.log(`${complete ? ">>> card complete <<<" : ">>> card NOT complete <<<"}   turns: ${turns}   gate disagreements: ${disagreements}/${events.length}`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  if (failures.length === 0) console.log("  all expectations met");
  console.log(BAR + "\n");
  return failures.length === 0;
}

const arg = process.argv[2] ?? "greenloop";
const names = arg === "all" ? Object.keys(SCENARIOS) : [arg];
for (const n of names) if (!SCENARIOS[n]) {
  console.error(`unknown scenario ${n}; choose from ${Object.keys(SCENARIOS).join(", ")} or all`);
  process.exit(2);
}

let ok = true;
for (const n of names) ok = (await runScenario(SCENARIOS[n])) && ok;
process.exit(ok ? 0 : 1);
