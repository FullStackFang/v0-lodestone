import { beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { createPgliteDb, type Db } from "@/db/client";
import { document } from "@/db/schema";
import { putArtifactText } from "@/harness/canonical";
import { ingestWork } from "@/harness/papers/ingest";
import type { OpenAlexWork } from "@/harness/papers/openalex";
import type { PaperSearchHit } from "./search";
import { validateLinks, type Links } from "./links";

const hit = (id: string, source: PaperSearchHit["source"]): PaperSearchHit => ({
  id,
  source,
  title: id,
  year: null,
  query_set: null,
  rating_avg: null,
  citations_per_year: null,
  link: null,
  similarity: null,
  abstract: "",
});

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
const work = (w: string, abstractWords: number | null): OpenAlexWork => ({
  id: `https://openalex.org/${w}`,
  title: `Work ${w}`,
  abstract_inverted_index: abstractWords === null ? null : Object.fromEntries(words(abstractWords).split(" ").map((t, i) => [t + w, [i]])),
});
const WORKS: Record<string, OpenAlexWork | null> = {
  W1: work("W1", 40),
  W2: work("W2", 5),
  W3: work("W3", null),
  W4: null,
};

let db: Db;
let stored: string;

const ingest = (id: string) => ingestWork(db, id, { fetchWork: async (x) => WORKS[x] ?? null, minWords: 30 });

beforeAll(async () => {
  db = await createPgliteDb();
  const [row] = await db.insert(document).values({ sessionId: null, source: "paper", title: "Stored", text: null }).returning({ id: document.id });
  await putArtifactText(db, { artifactId: row.id, sourceFormat: "abstract", parser: "test", text: "a stored abstract", provenance: {} });
  stored = row.id;
});

const one = (id: string): Links => ({
  items: [{ text: "A claim.", kind: "claim", links: [{ id, relation: "supports", quote: "q" }] }],
  unresolved: [],
});

describe("validateLinks", () => {
  it("moves an id the search never returned to unresolved as not_in_search", async () => {
    const out = await validateLinks(one("invented-id"), [hit(stored, "corpus")], ingest);
    expect(out.items[0].links).toEqual([]);
    expect(out.unresolved).toEqual([{ text: "A claim.", kind: "claim", link: { id: "invented-id", relation: "supports", quote: "q" }, reason: "not_in_search" }]);
  });

  it("replaces a W-id that ingests with its document id", async () => {
    const out = await validateLinks(one("W1"), [hit("W1", "openalex")], ingest);
    expect(out.unresolved).toEqual([]);
    const [link] = out.items[0].links;
    expect(link.id).not.toBe("W1");
    expect(link.from).toBe("W1");
    // A second pass over its own output resolves the same way.
    const again = await validateLinks(out, [hit("W1", "openalex")], ingest);
    expect(again.items[0].links).toEqual([link]);
    expect(again.unresolved).toEqual([]);
  });

  for (const [w, status] of [["W2", "short_abstract"], ["W3", "no_abstract"], ["W4", "not_found"]] as const) {
    it(`moves a W-id that comes back ${status} to unresolved with that status`, async () => {
      const out = await validateLinks(one(w), [hit(w, "openalex")], ingest);
      expect(out.items[0].links).toEqual([]);
      expect(out.unresolved[0]).toMatchObject({ link: { id: w }, reason: status });
    });
  }

  it("leaves only stored document ids in items", async () => {
    const links: Links = {
      items: [
        { text: "Taken.", kind: "claim", links: [{ id: stored, relation: "taken_by", quote: "" }, { id: "W1", relation: "supports", quote: "" }] },
        { text: "Gap.", kind: "gap", links: [{ id: "W2", relation: "supports", quote: "" }, { id: "nope", relation: "contradicts", quote: "" }] },
        { text: "Test.", kind: "smoke_test", links: [{ id: "W4", relation: "supports", quote: "" }] },
      ],
      unresolved: [],
    };
    const out = await validateLinks(links, [hit(stored, "corpus"), hit("W1", "openalex"), hit("W2", "openalex"), hit("W4", "openalex")], ingest);
    const ids = out.items.flatMap((i) => i.links.map((l) => l.id));
    expect(ids).toHaveLength(2);
    const found = await db.select({ id: document.id }).from(document).where(inArray(document.id, ids));
    expect(found.map((f) => f.id).sort()).toEqual([...ids].sort());
    expect(out.unresolved.map((u) => u.reason).sort()).toEqual(["not_found", "not_in_search", "short_abstract"]);
  });
});
