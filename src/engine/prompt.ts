/** Prompt assembly. The files under `prompts/` are the prompts — nothing is
 *  hard-coded here except the order they go in and the line that names the
 *  stage. `promptVersion` is the sha256 of the effective text, so an edit
 *  to any file the turn used changes the version on that turn's event, and
 *  an edit to a stage file the turn did not use does not. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import type { CardFields } from "@/schema/card";
import type { Stage } from "./stages";

const PROMPTS_DIR = path.join(process.cwd(), "prompts");

const cache = new Map<string, string>();

/** Read once per process. Under test the cache is bypassed so a file edit
 *  between assertions is seen. */
export function readPrompt(name: string): string {
  if (!process.env.VITEST && cache.has(name)) return cache.get(name)!;
  const text = readFileSync(path.join(PROMPTS_DIR, `${name}.md`), "utf8").replace(/\r\n/g, "\n");
  cache.set(name, text);
  return text;
}

/** The `## Fallback` section of a stage file — the fixed question asked when
 *  the model's output fails validation twice. */
export function fallbackQuestion(stage: Stage): string {
  const text = readPrompt(stage);
  const at = text.indexOf("\n## Fallback");
  if (at < 0) throw new Error(`prompts/${stage}.md has no ## Fallback section`);
  const body = text.slice(at + "\n## Fallback".length).split("\n## ")[0];
  return body.trim().replace(/\s*\n\s*/g, " ");
}

export interface AssembledPrompt {
  system: Anthropic.TextBlockParam[];
  /** sha256 of every prompt byte the turn will see, in order. */
  promptVersion: string;
}

export function assemblePrompt(stage: Stage): AssembledPrompt {
  const kernel = readPrompt("system");
  const schema = readPrompt("schema");
  const module = readPrompt(stage);
  const stable = `${kernel}\n\n---\n\n${schema}`;
  const promptVersion = createHash("sha256").update(stable).update("\n\n---\n\n").update(module).digest("hex");
  return {
    system: [
      // Kernel + schema are identical for every turn of every card: cache them.
      { type: "text", text: stable, cache_control: { type: "ephemeral" } },
      { type: "text", text: module },
    ],
    promptVersion,
  };
}

/** The turn's user message: the card as it stands, where the server says it
 *  is, and what the founder just said. Card first so the volatile part is
 *  last. */
export function turnContext(input: {
  stage: Stage;
  gateReason: string;
  fields: CardFields;
  userInput: string;
}): string {
  const where =
    input.stage === "render"
      ? "Every gate passes; the card is complete."
      : `Open at \`${input.stage}\`: ${input.gateReason || "not yet passed"}.`;
  return [
    "<card>",
    JSON.stringify(input.fields, null, 2),
    "</card>",
    "",
    where,
    "",
    "<founder>",
    input.userInput,
    "</founder>",
  ].join("\n");
}
