/** The Anthropic API as a model. `THESIS_MODEL` / `THESIS_EFFORT` from the
 *  environment; adaptive thinking is on by default on the Opus 5 family and
 *  is left alone. A refusal or a schema miss throws, and `runTurn` retries
 *  once with the error before asking the founder directly. */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { DEFAULT_EFFORT, DEFAULT_MODEL, TurnOutput, type ModelFn } from "./turn";

const MAX_TOKENS = 8000;

let client: Anthropic | undefined;

export const anthropicModel: ModelFn = async (req) => {
  client ??= new Anthropic();
  const model = process.env.THESIS_MODEL || DEFAULT_MODEL;
  const effort = (process.env.THESIS_EFFORT || DEFAULT_EFFORT) as "low" | "medium" | "high";
  const response = await client.messages.parse({
    model,
    max_tokens: MAX_TOKENS,
    system: req.system,
    messages: req.messages,
    output_config: { effort, format: zodOutputFormat(TurnOutput) },
  });
  if (response.stop_reason === "refusal") {
    throw new Error(`model refused: ${response.stop_details?.explanation ?? "no explanation"}`);
  }
  if (!response.parsed_output) throw new Error(`no structured output (stop_reason ${response.stop_reason})`);
  return {
    output: response.parsed_output,
    model: response.model,
    usage: response.usage as unknown as Record<string, unknown>,
  };
};
