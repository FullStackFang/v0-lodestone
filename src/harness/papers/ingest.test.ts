import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { artifactTexts, document, session } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { OpenAlexWork } from "./openalex";
import { ingestLine, ingestWork, parseList } from "./ingest";

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
    expect(doc.text).toBe(fixture.expected_abstract);
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
