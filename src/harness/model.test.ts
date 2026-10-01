import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const Shape = z.object({ facet: z.enum(["purpose", "mechanism"]), text: z.string() });

/** `runClaudeCli` is the only thing the CLI path touches; the engine module
 *  itself is never modified by the harness. */
const runClaudeCli = vi.hoisted(() => vi.fn());
vi.mock("@/engine/cli-model", () => ({ runClaudeCli }));

const { InvalidOutput, NoModel, __setAnthropicClient, draft7, structured } = await import("./model");

const saved = { ...process.env };

afterEach(() => {
  vi.clearAllMocks();
  __setAnthropicClient(undefined);
  process.env = { ...saved };
});

describe("structured — the CLI engine", () => {
  it("passes a draft-7 schema with no $schema key and re-parses the result", async () => {
    process.env.THESIS_ENGINE = "cli";
    delete process.env.VERCEL;
    runClaudeCli.mockResolvedValue({
      structured_output: { facet: "purpose", text: "reduce time to diagnosis" },
      usage: { input_tokens: 100, output_tokens: 20 },
    });
    const result = await structured(Shape, { system: "s", prompt: "p", model: "claude-opus-5" });
    expect(result.output).toEqual({ facet: "purpose", text: "reduce time to diagnosis" });
    expect(result.model).toBe("cli:claude-opus-5");
    expect(result.usage).toEqual({ input_tokens: 100, output_tokens: 20 });

    const passed = runClaudeCli.mock.calls[0][0];
    expect(passed.schema.$schema).toBeUndefined();
    expect(passed.schema.type).toBe("object");
  });

  it("throws InvalidOutput when the CLI's own validator let something through", async () => {
    process.env.THESIS_ENGINE = "cli";
    delete process.env.VERCEL;
    runClaudeCli.mockResolvedValue({ structured_output: { facet: "vibe", text: "x" } });
    const err = await structured(Shape, { system: "s", prompt: "p" }).catch((e) => e);
    expect(err).toBeInstanceOf(InvalidOutput);
    expect(err.issues).toMatch(/facet/);
  });

  it("throws InvalidOutput when there is no structured output at all", async () => {
    process.env.THESIS_ENGINE = "cli";
    delete process.env.VERCEL;
    runClaudeCli.mockResolvedValue({ result: "I could not answer." });
    await expect(structured(Shape, { system: "s", prompt: "p" })).rejects.toBeInstanceOf(InvalidOutput);
  });

  it("refuses to spawn on Vercel", async () => {
    process.env.THESIS_ENGINE = "cli";
    process.env.VERCEL = "1";
    await expect(structured(Shape, { system: "s", prompt: "p" })).rejects.toBeInstanceOf(NoModel);
    expect(runClaudeCli).not.toHaveBeenCalled();
  });
});

describe("structured — the API engine", () => {
  function fakeClient(response: unknown) {
    return { messages: { parse: vi.fn().mockResolvedValue(response) } } as never;
  }

  it("parses and re-validates the API's output", async () => {
    process.env.THESIS_ENGINE = "api";
    __setAnthropicClient(
      fakeClient({
        parsed_output: { facet: "mechanism", text: "a triage app" },
        model: "claude-opus-5",
        usage: { input_tokens: 5 },
        stop_reason: "end_turn",
      }),
    );
    const result = await structured(Shape, { system: "s", prompt: "p" });
    expect(result.output.facet).toBe("mechanism");
    expect(result.model).toBe("claude-opus-5");
    expect(runClaudeCli).not.toHaveBeenCalled();
  });

  it("turns a refusal into InvalidOutput", async () => {
    process.env.THESIS_ENGINE = "api";
    __setAnthropicClient(
      fakeClient({ stop_reason: "refusal", stop_details: { explanation: "no" }, parsed_output: null }),
    );
    await expect(structured(Shape, { system: "s", prompt: "p" })).rejects.toBeInstanceOf(InvalidOutput);
  });

  it("re-validates output the API accepted but the schema does not", async () => {
    process.env.THESIS_ENGINE = "api";
    __setAnthropicClient(
      fakeClient({ parsed_output: { facet: "vibe", text: "x" }, model: "m", usage: {}, stop_reason: "end_turn" }),
    );
    await expect(structured(Shape, { system: "s", prompt: "p" })).rejects.toBeInstanceOf(InvalidOutput);
  });
});

describe("draft7", () => {
  it("drops the $schema key the CLI's validator rejects", () => {
    const json = draft7(Shape);
    expect(json.$schema).toBeUndefined();
    expect(json.properties).toHaveProperty("facet");
  });
});

describe("the stage engine is untouched", () => {
  it("still types its own model function on TurnOutput", async () => {
    const src = (await import("node:fs")).readFileSync(
      (await import("node:path")).join(process.cwd(), "src", "engine", "turn.ts"),
      "utf8",
    );
    expect(src).toMatch(/export type ModelFn = \(req: ModelRequest\) => Promise<ModelResponse>;/);
    // The one edit this change makes to the engine.
    expect(src).toMatch(/export const HISTORY_TURNS/);
  });
});
