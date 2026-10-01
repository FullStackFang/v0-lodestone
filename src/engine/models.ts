/** Which real model a turn uses. `THESIS_ENGINE=api|cli` decides outright;
 *  otherwise an API key means the API and no key means the Claude Code CLI
 *  (key-free, the developer's own login, $0 — the lab's arrangement). */
import { anthropicModel } from "./api-model";
import { claudeCliModel } from "./cli-model";
import type { ModelFn } from "./turn";

export type EngineKind = "api" | "cli";

export function engineKind(): EngineKind {
  const forced = process.env.THESIS_ENGINE;
  if (forced === "api" || forced === "cli") return forced;
  return process.env.ANTHROPIC_API_KEY ? "api" : "cli";
}

export function defaultModel(): ModelFn {
  return engineKind() === "api" ? anthropicModel : claudeCliModel;
}
