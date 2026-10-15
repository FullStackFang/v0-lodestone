import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { artifactTexts, document, session } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { OpenAlexWork } from "./openalex";
import { ingestLine, ingestWork, MIN_ABSTRACT_WORDS, parseList, wordCount } from "./ingest";

const fixture = JSON.parse(
  readFileSync(path.join(process.cwd(), "evals", "harness", "papers", "inverted-index.json"), "utf8"),
) as { work: OpenAlexWork; expected_abstract: string; text_hash: string };

/** A second work, different id and DOI, that resolves to the same abstract. */
const twin: OpenAlexWork = {
  ...fixture.work,
  id: "https://openalex.org/W8888888888",
  doi: "https://doi.org/10.5555/twin.2026",
  title: "The same abstract under another DOI",
};

const other: OpenAlexWork = {
  id: "https://openalex.org/W7777777777",
  doi: "https://doi.org/10.5555/other.2026",
  title: "A different abstract",
  publication_year: 2024,
  primary_topic: { field: { display_name: "Medicine" } },
  abstract_inverted_index: { A: [0], different: [1], abstract: [2] },
};

const abstractless: OpenAlexWork = { id: "https://openalex.org/W6", title: "Withheld" };

const from = (works: Record<string, OpenAlexWork | null>) => ({
  fetchWork: async (id: string) => works[id] ?? null,
});

let db: Db;

beforeAll(async () => {
  db = await createPgliteDb();
});

describe("ingestWork", () => {
  it("writes one document and one artifact text, with the field in provenance", async () => {
    const result = await ingestWork(db, "10.5555/fixture.2026", from({ "10.5555/fixture.2026": fixture.work }));

    expect(result.status).toBe("ok");
    expect(result.created).toBe(true);
    expect(result.textHash).toBe(fixture.text_hash);

    const [text] = await db.select().from(artifactTexts).where(eq(artifactTexts.textHash, result.textHash!));
    expect(text.canonicalText).toBe(fixture.expected_abstract);
    expect(text.parser).toBe("openalex-abstract-v1");
    expect(text.sourceFormat).toBe("abstract");
    expect(text.provenance).toMatchObject({
      doi: "10.5555/fixture.2026",
      field: "Engineering",
      venue: "Journal of Fixtures",
      year: 2026,
      authors: ["A. Reader", "B. Writer"],
    });

    const [doc] = await db.select().from(document).where(eq(document.id, result.artifactId!));
    expect(doc.source).toBe("paper");
    expect(doc.sessionId).toBeNull();
    // The abstract's one home is the canonical text above.
    expect(doc.text).toBeNull();
  });

  it("is idempotent on the same identifier", async () => {
    const before = await db.select().from(artifactTexts);
    const documentsBefore = await db.select().from(document);

    const again = await ingestWork(db, "10.5555/fixture.2026", from({ "10.5555/fixture.2026": fixture.work }));

    expect(again.textHash).toBe(fixture.text_hash);
    expect(again.created).toBe(false);
    expect(await db.select().from(artifactTexts)).toHaveLength(before.length);
    expect(await db.select().from(document)).toHaveLength(documentsBefore.length);
  });

  it("reports the first artifact when two identifiers share one abstract", async () => {
    const first = await ingestWork(db, "10.5555/fixture.2026", from({ "10.5555/fixture.2026": fixture.work }));
    const second = await ingestWork(db, "10.5555/twin.2026", from({ "10.5555/twin.2026": twin }));

    expect(second.textHash).toBe(first.textHash);
    expect(second.artifactId).toBe(first.artifactId);
    expect(second.sharedWith).toBe(first.artifactId);
    expect(second.created).toBe(false);
  });

  it("creates no session row for any paper", async () => {
    await ingestWork(db, "10.5555/other.2026", from({ "10.5555/other.2026": other }));
    expect(await db.select().from(session)).toHaveLength(0);
    const documents = await db.select().from(document);
    expect(documents.every((d) => d.sessionId === null)).toBe(true);
  });

  it("reports a withheld abstract and writes nothing", async () => {
    const texts = await db.select().from(artifactTexts);
    const result = await ingestWork(db, "W6", from({ W6: abstractless }));

    expect(result.status).toBe("no_abstract");
    expect(ingestLine(result)).toBe("W6 no_abstract");
    expect(await db.select().from(artifactTexts)).toHaveLength(texts.length);
  });

  it("reports a work OpenAlex does not know", async () => {
    const result = await ingestWork(db, "W404", from({}));
    expect(result.status).toBe("not_found");
  });

  it("prints identifier, artifact and hash", async () => {
    const result = await ingestWork(db, "10.5555/other.2026", from({ "10.5555/other.2026": other }));
    expect(ingestLine(result)).toBe(`10.5555/other.2026 ${result.artifactId} ${result.textHash}`);
    expect(result.textHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("parseList", () => {
  it("drops comments and blanks", () => {
    expect(parseList("# CSCW\n10.1/a\n\n  10.2/b  # inline\n")).toEqual(["10.1/a", "10.2/b"]);
  });
});

describe("dedupe on the source's own id", () => {
  const fresh: OpenAlexWork = {
    id: "https://openalex.org/W5555555555",
    doi: "https://doi.org/10.5555/Fresh.2026",
    title: "A fresh abstract",
    publication_year: 2025,
    abstract_inverted_index: { A: [0], fresh: [1], abstract: [2], here: [3] },
  };

  it("carries extra provenance, such as the query set, onto the row", async () => {
    const result = await ingestWork(db, fresh.id!, { fetchWork: async () => fresh, provenance: { query_set: "cold-chain", query: "cold chain" } });
    expect(result.created).toBe(true);
    const [text] = await db.select().from(artifactTexts).where(eq(artifactTexts.textHash, result.textHash!));
    expect(text.provenance).toMatchObject({ query_set: "cold-chain", query: "cold chain", openalex_id: fresh.id });
  });

  it("answers a second ingest by OpenAlex id, DOI or URL from the stored row, without fetching", async () => {
    const first = (await db.select().from(artifactTexts)).find((t) => t.provenance.openalex_id === fresh.id)!;
    let fetched = 0;
    const counting = { fetchWork: async () => (fetched++, fresh) };
    for (const id of ["W5555555555", "https://openalex.org/W5555555555", "10.5555/fresh.2026", "https://doi.org/10.5555/FRESH.2026"]) {
      const again = await ingestWork(db, id, counting);
      expect(again).toMatchObject({ status: "ok", created: false, artifactId: first.artifactId, textHash: first.textHash });
      expect(ingestLine(again)).toBe(`${id} ${first.artifactId} ${first.textHash}`);
    }
    expect(fetched).toBe(0);
  });

  it("checks the fetched work's ids before writing, whatever the identifier was", async () => {
    const before = (await db.select().from(document)).length;
    // A search hands the work over directly; its id is already stored.
    const result = await ingestWork(db, "search-result", { fetchWork: async () => ({ ...fresh, abstract_inverted_index: { Edited: [0] } }) });
    expect(result.created).toBe(false);
    expect((await db.select().from(document)).length).toBe(before);
  });

  it("holds the ids unique in the database too", async () => {
    const [doc] = await db.insert(document).values({ sessionId: null, source: "paper", title: "dup", text: "dup" }).returning();
    await expect(
      db.insert(artifactTexts).values({
        artifactId: doc.id,
        version: 1,
        canonicalText: "a different text entirely",
        textHash: "f".repeat(64),
        parser: "test",
        sourceFormat: "abstract",
        provenance: { openalex_id: fresh.id },
      }),
    ).rejects.toThrow();
    // A DOI differing only in case names the same work.
    await expect(
      db.insert(artifactTexts).values({
        artifactId: doc.id,
        version: 1,
        canonicalText: "yet another text",
        textHash: "e".repeat(64),
        parser: "test",
        sourceFormat: "abstract",
        provenance: { doi: "10.5555/FRESH.2026" },
      }),
    ).rejects.toThrow();
  });
});

describe("the minimum abstract", () => {
  it("refuses a subject tag as short_abstract when asked, and writes nothing", async () => {
    const tag: OpenAlexWork = { id: "https://openalex.org/W3030", title: "Digital", abstract_inverted_index: { International: [0], audience: [1] } };
    const before = (await db.select().from(document)).length;
    const result = await ingestWork(db, tag.id!, { fetchWork: async () => tag, minWords: MIN_ABSTRACT_WORDS });
    expect(result.status).toBe("short_abstract");
    expect(ingestLine(result)).toBe(`${tag.id} short_abstract`);
    expect((await db.select().from(document)).length).toBe(before);
    expect(wordCount("a  b c")).toBe(3);
  });
});
