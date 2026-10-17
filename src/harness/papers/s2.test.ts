import { describe, expect, it } from "vitest";
import { S2_PER_SECOND, s2Limiter, type Clock } from "./rate";
import { s2SearchUrl, searchS2 } from "./s2";

const noWait = async () => {};

function fakeS2(body: unknown, status = 200) {
  const calls: { url: URL; headers: Headers }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: new URL(String(input)), headers: new Headers(init?.headers) });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
  return { impl, calls };
}

describe("s2SearchUrl", () => {
  it("asks for the ids, title, year and TLDR, twenty-five at most", () => {
    const url = new URL(s2SearchUrl("quiet study space", 25));
    expect(url.origin + url.pathname).toBe("https://api.semanticscholar.org/graph/v1/paper/search");
    expect(url.searchParams.get("query")).toBe("quiet study space");
    expect(url.searchParams.get("limit")).toBe("25");
    expect(url.searchParams.get("fields")).toBe("externalIds,title,year,tldr");
  });
});

describe("searchS2", () => {
  it("sends the key as x-api-key and yields a DOI with its TLDR", async () => {
    const { impl, calls } = fakeS2({
      data: [
        { paperId: "p1", title: "A", externalIds: { DOI: "10.1000/ABC" }, tldr: { text: "Quiet helps." } },
        { paperId: "p2", title: "B", externalIds: { DOI: "10.2000/x" }, tldr: null },
      ],
    });
    const result = await searchS2({ query: "q", apiKey: "s2-key", fetchImpl: impl, wait: noWait });
    expect(calls[0].headers.get("x-api-key")).toBe("s2-key");
    expect(result.hits).toEqual([
      { doi: "10.1000/abc", tldr: "Quiet helps." },
      { doi: "10.2000/x", tldr: null },
    ]);
    expect(result.skippedNoDoi).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it("sends no key header without a key", async () => {
    const { impl, calls } = fakeS2({ data: [] });
    await searchS2({ query: "q", apiKey: "", fetchImpl: impl, wait: noWait });
    expect(calls[0].headers.has("x-api-key")).toBe(false);
  });

  it("skips and counts a paper without a DOI", async () => {
    const { impl } = fakeS2({ data: [{ paperId: "p3", title: "C", externalIds: { ArXiv: "2101.1" }, tldr: { text: "t" } }] });
    const result = await searchS2({ query: "q", fetchImpl: impl, wait: noWait });
    expect(result.hits).toEqual([]);
    expect(result.skippedNoDoi).toBe(1);
  });

  it("reports a 429 as an error, without throwing", async () => {
    const { impl } = fakeS2("Too Many Requests", 429);
    const result = await searchS2({ query: "q", fetchImpl: impl, wait: noWait });
    expect(result.hits).toEqual([]);
    expect(result.error).toMatch(/429/);
  });

  it("spaces requests a second apart", async () => {
    let t = 0;
    const starts: number[] = [];
    const clock: Clock = { now: () => t, sleep: async (ms) => void (t += ms) };
    const impl = (async () => {
      starts.push(t);
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as typeof fetch;
    const wait = s2Limiter(clock);
    for (let i = 0; i < 3; i++) await searchS2({ query: "q", fetchImpl: impl, wait });
    expect(starts).toEqual([0, 1000, 2000]);
    expect(S2_PER_SECOND).toBe(1);
  });
});
