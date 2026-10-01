/** One structured-output call for the harness, over either engine.
 *
 * `ModelFn` in `src/engine/turn.ts` types its output as `TurnOutput` and
 * `cli-model.ts` hard-wires `cliSchema()` and `TurnOutput.safeParse`, so
 * "run the extraction through the existing model function" cannot be done
 * without changing the stage engine. This module is the alternative: the
 * same two engines, the same `engineKind()` rule, an arbitrary Zod schema,
 * and not one line changed under `src/engine/` except an exported constant.
 *
 * The Zod parse happens on both paths. The CLI has its own draft-7
 * validator and the API has structured outputs; neither is this schema, and
 * a model that satisfies the shape can still return a facet that is not in
 * the vocabulary.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z, type ZodType } from "zod";
import { runClaudeCli } from "@/engine/cli-model";
import { engineKind } from "@/engine/models";
import { DEFAULT_EFFORT, DEFAULT_MODEL } from "@/engine/turn";

/** No model can run here: the CLI engine inside a serverless function. */
export class NoModel extends Error {}

/** The model answered, and the answer is not what the schema describes. */
export class InvalidOutput extends Error {
  constructor(
    message: string,
    /** The Zod issues, formatted one per line, for the retry prompt. */
    readonly issues: string,
  ) {
    super(message);
  }
}

export interface StructuredRequest {
  system: string;
  prompt: string;
  model?: string;
  effort?: string;
}

export interface StructuredResult<T> {
  output: T;
  model: string;
  usage: Record<string, unknown> | null;
}

const MAX_TOKENS = 8000;

let client: Anthropic | undefined;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
}

/** The CLI's validator is draft-07 and rejects a 2020-12 `$schema` key
 *  outright, so emit draft-7 and drop the key — the same rule
 *  `cliSchema()` follows for `TurnOutput`. */
export function draft7(schema: ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-7", io: "output" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

function parseOrThrow<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issues = formatIssues(parsed.error);
    throw new InvalidOutput(`output did not validate:\n${issues}`, issues);
  }
  return parsed.data;
}

export async function structured<T>(
  schema: ZodType<T>,
  request: StructuredRequest,
): Promise<StructuredResult<T>> {
  const kind = engineKind();
  const model = request.model || process.env.THESIS_MODEL || DEFAULT_MODEL;
  const effort = request.effort || process.env.THESIS_EFFORT || DEFAULT_EFFORT;

  if (kind === "cli") {
    // There is no `claude.exe` in a serverless function, and `after()` has a
    // bounded lifetime. Refuse before spawning rather than time out.
    if (process.env.VERCEL) throw new NoModel("the CLI engine cannot run on Vercel");
    const envelope = await runClaudeCli({
      system: request.system,
      prompt: request.prompt,
      model,
      effort,
      schema: draft7(schema),
    });
    if (envelope.structured_output === undefined) {
      throw new InvalidOutput(
        `claude returned no structured_output: ${String(envelope.result).slice(0, 300)}`,
        "the model returned no structured output at all",
      );
    }
    return {
      output: parseOrThrow(schema, envelope.structured_output),
      model: `cli:${model}`,
      usage: envelope.usage ?? null,
    };
  }

  client ??= new Anthropic();
  const response = await client.messages.parse({
    model,
    max_tokens: MAX_TOKENS,
    system: request.system,
    messages: [{ role: "user", content: request.prompt }],
    output_config: { effort: effort as "low" | "medium" | "high", format: zodOutputFormat(schema) },
  });
  if (response.stop_reason === "refusal") {
    throw new InvalidOutput(
      `model refused: ${response.stop_details?.explanation ?? "no explanation"}`,
      "the model refused",
    );
  }
  if (!response.parsed_output) {
    throw new InvalidOutput(
      `no structured output (stop_reason ${response.stop_reason})`,
      "the model returned no structured output at all",
    );
  }
  return {
    output: parseOrThrow(schema, response.parsed_output),
    model: response.model,
    usage: response.usage as unknown as Record<string, unknown>,
  };
}

/** Injected in tests. The extraction core takes this shape so a fake model
 *  needs no network, no key and no CLI. */
export type StructuredFn = typeof structured;

/** For a test that wants the real client replaced. */
export function __setAnthropicClient(fake: Anthropic | undefined): void {
  client = fake;
}
