import { describe, expect, it } from "vitest";
import type { OpenAlexWork } from "./openalex";
import { OPENALEX_SEMANTIC_PER_SECOND, openalexSemanticLimiter, type Clock } from "./rate";
import { searchUrl, searchWorks } from "./search";

const work = (n: number): OpenAlexWork => ({
  id: `https://openalex.org/W${n}`,
  title: `Work ${n}`,
  abstract_inverted_index: { Work: [0], [String(n)]: [1] },
});

/** A fake OpenAlex: each cursor answers with its page, or with a status. */
function fakeOpenAlex(pages: Record<string, { works: OpenAlexWork[]; next: string | null; notice?: string } | number>) {
  const urls: URL[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    urls.push(url);
    const page = pages[url.searchParams.get("cursor") ?? ""];
    if (page === undefined) return new Response("no such cursor", { status: 400 });
    if (typeof page === "number") return new Response("slow down", { status: page });
    return new Response(JSON.stringify({ results: page.works, meta: { next_cursor: page.next, notice: page.notice } }), { status: 200 });
  }) as typeof fetch;
  return { impl, urls };
}

const noWait = async () => {};

describe("searchUrl", () => {
  it("filters to works with an abstract since a year and carries the polite address", () => {
    const url = new URL(searchUrl({ query: "food waste logistics", since: 2018, cursor: "*", perPage: 200, mailto: "a@b.edu" }));
    expect(url.origin + url.pathname).toBe("https://api.openalex.org/works");
    expect(url.searchParams.get("search")).toBe("food waste logistics");
    expect(url.searchParams.get("filter")).toBe("has_abstract:true,from_publication_date:2018-01-01");
    expect(url.searchParams.get("per-page")).toBe("200");
    expect(url.searchParams.get("cursor")).toBe("*");
    expect(url.searchParams.get("mailto")).toBe("a@b.edu");
  });

  it("omits the date filter and the address when neither is given", () => {
    const url = new URL(searchUrl({ query: "q", cursor: "*", perPage: 5, mailto: "" }));
    expect(url.searchParams.get("filter")).toBe("has_abstract:true");
    expect(url.searchParams.has("mailto")).toBe(false);
    expect(url.searchParams.has("api_key")).toBe(false);
  });

  it("carries the key that cursor paging past the first page needs", () => {
    const url = new URL(searchUrl({ query: "q", cursor: "c2", perPage: 200, apiKey: "k-1" }));
    expect(url.searchParams.get("api_key")).toBe("k-1");
  });
});

describe("searchWorks", () => {
  it("follows the cursor across two pages and hands over every work in order", async () => {
    const { impl, urls } = fakeOpenAlex({
      "*": { works: [work(1), work(2)], next: "c2" },
      c2: { works: [work(3)], next: null },
    });
    const seen: string[] = [];
    const result = await searchWorks(
      { query: "q", since: 2020, mailto: "a@b.edu", fetchImpl: impl, wait: noWait },
      async (w) => void seen.push(w.id!),
    );
    expect(seen).toEqual(["https://openalex.org/W1", "https://openalex.org/W2", "https://openalex.org/W3"]);
    expect(result).toEqual({ seen: 3, stopped: false, cursor: null });
    expect(urls.map((u) => u.searchParams.get("cursor"))).toEqual(["*", "c2"]);
    for (const u of urls) {
      expect(u.searchParams.get("filter")).toContain("has_abstract:true");
      expect(u.searchParams.get("filter")).toContain("from_publication_date:2020-01-01");
      expect(u.searchParams.get("mailto")).toBe("a@b.edu");
    }
  });

  it("stops on a 429 with the cursor of the page it could not read, without throwing", async () => {
    const { impl } = fakeOpenAlex({
      "*": { works: [work(1)], next: "c2" },
      c2: { works: [work(2)], next: "c3" },
      c3: 429,
    });
    const seen: string[] = [];
    const result = await searchWorks({ query: "q", fetchImpl: impl, wait: noWait }, async (w) => void seen.push(w.id!));
    expect(seen).toHaveLength(2);
    expect(result).toMatchObject({ seen: 2, stopped: true, cursor: "c3" });
    expect(result.reason).toMatch(/429/);
  });

  it("stops on a network failure the same way", async () => {
    const impl = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const result = await searchWorks({ query: "q", cursor: "c9", fetchImpl: impl, wait: noWait }, async () => {});
    expect(result).toMatchObject({ seen: 0, stopped: true, cursor: "c9" });
    expect(result.reason).toMatch(/fetch failed/);
  });

  it("resumes from a given cursor", async () => {
    const { impl, urls } = fakeOpenAlex({ c3: { works: [work(3)], next: null } });
    const result = await searchWorks({ query: "q", cursor: "c3", fetchImpl: impl, wait: noWait }, async () => {});
    expect(result.seen).toBe(1);
    expect(urls[0].searchParams.get("cursor")).toBe("c3");
  });

  it("asks for no more than the limit and hands back where it stopped", async () => {
    const { impl, urls } = fakeOpenAlex({
      "*": { works: [work(1), work(2)], next: "c2" },
      c2: { works: [work(3)], next: "c3" },
    });
    const result = await searchWorks({ query: "q", limit: 3, fetchImpl: impl, wait: noWait }, async () => {});
    expect(result).toEqual({ seen: 3, stopped: false, cursor: "c3" });
    expect(urls.map((u) => u.searchParams.get("per-page"))).toEqual(["3", "1"]);
  });

  it("waits on the limiter before every request and reports each page", async () => {
    const { impl } = fakeOpenAlex({
      "*": { works: [work(1)], next: "c2" },
      c2: { works: [work(2)], next: null },
    });
    let waits = 0;
    const pages: string[] = [];
    await searchWorks(
      { query: "q", fetchImpl: impl, wait: async () => void waits++, onPage: (p) => void pages.push(`${p.cursor}:${p.works}`) },
      async () => {},
    );
    expect(waits).toBe(2);
    expect(pages).toEqual(["*:1", "c2:1"]);
  });

  it("hands each page's notice to the caller", async () => {
    const { impl } = fakeOpenAlex({
      "*": { works: [work(1)], next: "c2" },
      c2: { works: [work(2)], next: null, notice: "You are on the shared daily budget." },
    });
    const notices: string[] = [];
    await searchWorks({ query: "q", fetchImpl: impl, wait: noWait, onNotice: (n) => void notices.push(n) }, async () => {});
    expect(notices).toEqual(["You are on the shared daily budget."]);
  });
});

describe("semantic search", () => {
  it("asks for search.semantic, never search or a cursor, fifty to a page, under the key", () => {
    const url = new URL(searchUrl({ query: "help students concentrate", cursor: "*", perPage: 200, apiKey: "k-1", semantic: true }));
    expect(url.searchParams.get("search.semantic")).toBe("help students concentrate");
    expect(url.searchParams.has("search")).toBe(false);
    expect(url.searchParams.has("cursor")).toBe(false);
    expect(url.searchParams.get("per-page")).toBe("50");
    expect(url.searchParams.get("api_key")).toBe("k-1");
    expect(url.searchParams.get("filter")).toBe("has_abstract:true");
  });

  it("reads one page of at most fifty and never follows a cursor", async () => {
    const works = Array.from({ length: 60 }, (_, i) => work(i + 1));
    const urls: URL[] = [];
    const impl = (async (input: string | URL | Request) => {
      urls.push(new URL(String(input)));
      return new Response(JSON.stringify({ results: works, meta: { next_cursor: "c2" } }), { status: 200 });
    }) as typeof fetch;
    let seen = 0;
    const result = await searchWorks({ query: "q", semantic: true, fetchImpl: impl, wait: noWait }, async () => void seen++);
    expect(seen).toBe(50);
    expect(result).toEqual({ seen: 50, stopped: false, cursor: null });
    expect(urls).toHaveLength(1);
  });

  it("spaces semantic requests a second apart by default", async () => {
    let t = 0;
    const starts: number[] = [];
    const clock: Clock = { now: () => t, sleep: async (ms) => void (t += ms) };
    const impl = (async () => {
      starts.push(t);
      return new Response(JSON.stringify({ results: [work(1)], meta: {} }), { status: 200 });
    }) as typeof fetch;
    const wait = openalexSemanticLimiter(clock);
    for (let i = 0; i < 3; i++) await searchWorks({ query: "q", semantic: true, fetchImpl: impl, wait }, async () => {});
    expect(starts).toEqual([0, 1000, 2000]);
    expect(OPENALEX_SEMANTIC_PER_SECOND).toBe(1);
  });

  it("returns stopped on a 429 without throwing", async () => {
    const impl = (async () => new Response("Semantic search is limited to 1 request per second.", { status: 429 })) as typeof fetch;
    const result = await searchWorks({ query: "q", semantic: true, fetchImpl: impl, wait: noWait }, async () => {});
    expect(result).toMatchObject({ seen: 0, stopped: true });
    expect(result.reason).toMatch(/429/);
  });
});
