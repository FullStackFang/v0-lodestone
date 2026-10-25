import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { document } from "@/db/schema";
import { putArtifactText } from "@/harness/canonical";
import { embedPaperAbstracts } from "@/lodestone/priorArt";
import { testEmbed } from "@/lodestone/test-embed";
import type { Embedder } from "@/lodestone/cards";
import { hitOf, mergeHits, openalexHits, searchPapers } from "./search";

const Q = "popularity bias recommendations";

let db: Db;

async function addPaper(title: string, abstract: string, provenance: Record<string, unknown>) {
  const [row] = await db.insert(document).values({ sessionId: null, source: "paper", title, text: null }).returning({ id: document.id });
  await putArtifactText(db, { artifactId: row.id, sourceFormat: "abstract", parser: "test", text: abstract, provenance });
  return row.id;
}

beforeAll(async () => {
  db = await createPgliteDb();
  // Forty-five near rows outside the set crowd out a first pass of k * 20.
  for (let n = 0; n < 45; n += 1) await addPaper(`Decoy ${n}`, `${Q} decoy${n}`, { query_set: "other" });
  await addPaper("Near", `${Q} alpha beta gamma delta`, { query_set: "neurips", rating_avg: 6.5, citations_per_year: 3, openreview: "https://openreview.net/forum?id=A", site: "https://nips.cc/a", year: 2023 });
  await addPaper("Nearer", `${Q} alpha beta`, { query_set: "neurips", site: "https://nips.cc/b", doi: "10.1/b", year: 2026 });
  await addPaper("Far", "graph neural networks for molecules", { query_set: "neurips", doi: "10.1/far" });
  await embedPaperAbstracts(db, testEmbed);
}, 120_000);

describe("searchPapers", () => {
  it("returns the nearest first", async () => {
    const hits = await searchPapers(db, testEmbed, { q: Q, k: 5 });
    expect(hits).toHaveLength(5);
    for (let at = 1; at < hits.length; at += 1) expect(hits[at - 1].similarity!).toBeGreaterThanOrEqual(hits[at].similarity!);
  });

  it("filters to a set, and still returns k when the set holds k near rows", async () => {
    const hits = await searchPapers(db, testEmbed, { q: Q, k: 2, set: "neurips" });
    expect(hits.map((h) => h.title)).toEqual(["Nearer", "Near"]);
    expect(hits.every((h) => h.query_set === "neurips" && h.source === "corpus")).toBe(true);
  });

  it("gives a missing metric as null", async () => {
    const [nearer, near] = await searchPapers(db, testEmbed, { q: Q, k: 2, set: "neurips" });
    expect(nearer).toMatchObject({ rating_avg: null, citations_per_year: null, year: 2026 });
    expect(near).toMatchObject({ rating_avg: 6.5, citations_per_year: 3, year: 2023 });
  });

  it("links OpenReview first, then the site, then the DOI", async () => {
    const [nearer, near] = await searchPapers(db, testEmbed, { q: Q, k: 2, set: "neurips" });
    expect(near.link).toBe("https://openreview.net/forum?id=A");
    expect(nearer.link).toBe("https://nips.cc/b");
    expect(hitOf({ document_id: "d", title: "t", similarity: 0.5, canonical_text: "x", provenance: { doi: "10.1/far" } }).link).toBe("https://doi.org/10.1/far");
    expect(hitOf({ document_id: "d", title: "t", similarity: 0.5, canonical_text: "x", provenance: {} }).link).toBeNull();
  });

  it("embeds the question in the query role", async () => {
    const roles: (string | undefined)[] = [];
    const spy: Embedder = async (texts, inputType) => {
      roles.push(inputType);
      return testEmbed(texts);
    };
    await searchPapers(db, spy, { q: Q, k: 1 });
    expect(roles).toEqual(["query"]);
  });

  it("refuses when nothing embedded the question", async () => {
    const none: Embedder = async (texts) => ({ vectors: texts.map(() => null), embedded: false, model: null, tokens: null });
    await expect(searchPapers(db, none, { q: Q, k: 1 })).rejects.toThrow(/VOYAGE_API_KEY/);
  });
});

describe("openalexHits", () => {
  it("lists live works by W-id and writes nothing", async () => {
    const before = (await db.select({ id: document.id }).from(document)).length;
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          results: [{ id: "https://openalex.org/W42", title: "Live work", publication_year: 2024, doi: "https://doi.org/10.9/live", abstract_inverted_index: { Live: [0], abstract: [1] } }],
          meta: { next_cursor: null },
        }),
        { status: 200 },
      )) as typeof fetch;
    const { hits, stopped } = await openalexHits(Q, 5, { fetchImpl, wait: async () => {} });
    expect(stopped).toBeNull();
    expect(hits).toEqual([
      { id: "W42", source: "openalex", title: "Live work", year: 2024, query_set: null, rating_avg: null, citations_per_year: null, link: "https://doi.org/10.9/live", similarity: null, abstract: "Live abstract" },
    ]);
    expect((await db.select({ id: document.id }).from(document)).length).toBe(before);
  });
});

describe("mergeHits", () => {
  const h = (id: string, source: "corpus" | "openalex", similarity: number | null) =>
    ({ id, source, similarity, title: id, year: null, query_set: null, rating_avg: null, citations_per_year: null, link: null, abstract: "" }) as const;

  it("keeps one hit per id at its best similarity, stored hits nearest first, then live hits in order", () => {
    const merged = mergeHits([
      [h("a", "corpus", 0.5), h("b", "corpus", 0.4), h("W1", "openalex", null)],
      [h("b", "corpus", 0.7), h("c", "corpus", 0.45), h("W2", "openalex", null), h("W1", "openalex", null)],
    ]);
    expect(merged.map((m) => [m.id, m.similarity])).toEqual([["b", 0.7], ["a", 0.5], ["c", 0.45], ["W1", null], ["W2", null]]);
  });
});
