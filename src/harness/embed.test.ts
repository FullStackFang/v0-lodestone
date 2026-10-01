import { afterEach, describe, expect, it, vi } from "vitest";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, embed } from "./embed";
import { EMBEDDING_DIMENSIONS as SCHEMA_DIMENSIONS } from "@/db/schema";

/** A recorded Voyage response, trimmed to the shape the wrapper reads. */
function recorded(count: number, tokens = 42) {
  return {
    object: "list",
    data: Array.from({ length: count }, (_, i) => ({
      object: "embedding",
      index: i,
      embedding: Array.from({ length: EMBEDDING_DIMENSIONS }, (_, d) => (d === i ? 1 : 0)),
    })),
    model: EMBEDDING_MODEL,
    usage: { total_tokens: tokens },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.VOYAGE_API_KEY;
});

describe("embed", () => {
  it("asserts its dimension against the schema", () => {
    expect(EMBEDDING_DIMENSIONS).toBe(SCHEMA_DIMENSIONS);
    expect(EMBEDDING_DIMENSIONS).toBe(1024);
  });

  it("returns null vectors and embedded: false with no key", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await embed(["a", "b"]);
    expect(result).toEqual({ vectors: [null, null], embedded: false, model: null, tokens: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the model and input type and returns vectors in order", async () => {
    process.env.VOYAGE_API_KEY = "vk-test";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(recorded(2)));
    const result = await embed(["first", "second"], "query");
    expect(result.embedded).toBe(true);
    expect(result.model).toBe(EMBEDDING_MODEL);
    expect(result.tokens).toBe(42);
    expect(result.vectors[0]?.[0]).toBe(1);
    expect(result.vectors[1]?.[1]).toBe(1);

    const body = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(body).toEqual({ input: ["first", "second"], model: EMBEDDING_MODEL, input_type: "query" });
  });

  it("reorders by the provider's index", async () => {
    process.env.VOYAGE_API_KEY = "vk-test";
    const shuffled = recorded(2);
    shuffled.data.reverse();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(shuffled));
    const result = await embed(["first", "second"]);
    expect(result.vectors[0]?.[0]).toBe(1);
    expect(result.vectors[1]?.[1]).toBe(1);
  });

  it("batches at 128", async () => {
    process.env.VOYAGE_API_KEY = "vk-test";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_url, init) => {
        const body = JSON.parse(String((init as RequestInit).body));
        return jsonResponse(recorded(body.input.length, 1));
      });
    const result = await embed(Array.from({ length: 300 }, (_, i) => `t${i}`));
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(result.vectors).toHaveLength(300);
    expect(result.tokens).toBe(3);
  });

  it("retries a 429 and succeeds", async () => {
    process.env.VOYAGE_API_KEY = "vk-test";
    vi.useFakeTimers();
    let calls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      calls += 1;
      return calls < 3 ? new Response("slow down", { status: 429 }) : jsonResponse(recorded(1));
    });
    const pending = embed(["one"]);
    await vi.runAllTimersAsync();
    const result = await pending;
    vi.useRealTimers();
    expect(calls).toBe(3);
    expect(result.embedded).toBe(true);
  });

  it("throws after the retry budget", async () => {
    process.env.VOYAGE_API_KEY = "vk-test";
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("slow down", { status: 429 }));
    const pending = embed(["one"]).catch((e: Error) => e);
    await vi.runAllTimersAsync();
    const result = await pending;
    vi.useRealTimers();
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toMatch(/429/);
  });

  it("rejects a vector of the wrong dimension", async () => {
    process.env.VOYAGE_API_KEY = "vk-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ data: [{ index: 0, embedding: [0, 1, 2] }], usage: { total_tokens: 1 } }),
    );
    await expect(embed(["one"])).rejects.toThrow(/dimensions/);
  });
});
