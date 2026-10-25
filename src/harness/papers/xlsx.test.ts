import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createPgliteDb, type Db } from "@/db/client";
import { artifactTexts, document } from "@/db/schema";
import { ingestNeuripsRow, readCorpusSheet, rowOf } from "./xlsx";

const SET = "neurips-test";

/** Cells as the sheet's header names them. */
const row2023 = {
  year: 2023,
  title: "Visual Instruction Tuning",
  first_author: "Haotian Liu",
  authors: "Haotian Liu; Chunyuan Li",
  track: "main",
  status: "Oral",
  topics: "LLMs & Foundation Models",
  citations: 6760,
  citations_per_year: 12.4,
  citation_percentile_in_year: 100,
  rating_avg: 6.25,
  abstract: "Instruction tuning large language models using machine generated data improves zero shot ability.",
  openreview: "https://openreview.net/forum?id=w0H2xGHlkw",
  pdf: "https://openreview.net/pdf?id=w0H2xGHlkw",
  site: "https://nips.cc/virtual/2023/poster/70080",
  id: "w0H2xGHlkw",
};

const row2026 = {
  year: 2026,
  title: "Soft Boundary Decomposition",
  authors: "Xiang Zhang",
  impact_tier: "Unknown (no citation data)",
  abstract: "Accurately modeling soft boundaries such as hair and defocus blur is a hard problem in stereo.",
  site: "https://neurips.cc/virtual/2026/poster/154295",
  id: "154295",
};

/** 2025 rows mark a missing citation count -1 and its percentile 0. */
const row2025 = {
  year: 2025,
  title: "Auditing privacy in one run",
  citations: -1,
  citations_per_year: -1,
  citation_percentile_in_year: 0,
  rating_avg: 5,
  abstract: "Recent methods for auditing the privacy of machine learning algorithms need many runs.",
  openreview: "https://openreview.net/forum?id=004uTlSufe",
  id: "004uTlSufe",
};

const tldrOnly = { year: 2021, title: "Short", tldr: "We do a thing well.", id: "tldrOnly1" };
const noText = { year: 2024, title: "Nothing", id: "noText1" };

let db: Db;

beforeAll(async () => {
  db = await createPgliteDb();
});

const count = async () => (await db.select({ n: sql<number>`count(*)::int` }).from(document))[0].n;

describe("rowOf", () => {
  it("takes the id as neurips_id and the OpenReview id from the link", () => {
    const row = rowOf(row2023)!;
    expect(row.text).toBe(row2023.abstract);
    expect(row.sourceFormat).toBe("abstract");
    expect(row.provenance).toMatchObject({
      neurips_id: "w0H2xGHlkw",
      openreview_id: "w0H2xGHlkw",
      year: 2023,
      authors: ["Haotian Liu", "Chunyuan Li"],
      rating_avg: 6.25,
      citations_per_year: 12.4,
    });
    expect(row.provenance).not.toHaveProperty("abstract");
  });

  it("drops the -1 citation sentinel and the percentile that rides with it", () => {
    const { provenance } = rowOf(row2025)!;
    expect(provenance.rating_avg).toBe(5);
    for (const key of ["citations", "citations_per_year", "citation_percentile_in_year"]) expect(provenance).not.toHaveProperty(key);
  });
});

describe("ingestNeuripsRow", () => {
  it("stores a 2023 row's abstract and metrics", async () => {
    const result = await ingestNeuripsRow(db, rowOf(row2023)!, { set: SET });
    expect(result.status).toBe("ok");
    expect(result.created).toBe(true);
    const [text] = await db.select().from(artifactTexts).where(eq(artifactTexts.artifactId, result.artifactId!));
    expect(text.canonicalText).toBe(row2023.abstract);
    expect(text.sourceFormat).toBe("abstract");
    expect(text.provenance).toMatchObject({ neurips_id: "w0H2xGHlkw", openreview_id: "w0H2xGHlkw", query_set: SET, rating_avg: 6.25, citations_per_year: 12.4 });
    const [doc] = await db.select().from(document).where(eq(document.id, result.artifactId!));
    expect(doc.source).toBe("paper");
    expect(doc.title).toBe(row2023.title);
  });

  it("stores a 2026 row without an OpenReview id or any metric key", async () => {
    const result = await ingestNeuripsRow(db, rowOf(row2026)!, { set: SET });
    const [text] = await db.select().from(artifactTexts).where(eq(artifactTexts.artifactId, result.artifactId!));
    expect(text.provenance).toMatchObject({ neurips_id: "154295" });
    for (const key of ["openreview_id", "rating_avg", "citations", "citations_per_year", "citation_percentile_in_year"]) {
      expect(text.provenance).not.toHaveProperty(key);
    }
  });

  it("stores a tldr-only row as a tldr", async () => {
    const result = await ingestNeuripsRow(db, rowOf(tldrOnly)!, { set: SET });
    const [text] = await db.select().from(artifactTexts).where(eq(artifactTexts.artifactId, result.artifactId!));
    expect(text.sourceFormat).toBe("tldr");
    expect(text.canonicalText).toBe(tldrOnly.tldr);
  });

  it("reports a row with no text as no_text and writes nothing", async () => {
    const before = await count();
    const result = await ingestNeuripsRow(db, rowOf(noText)!, { set: SET });
    expect(result.status).toBe("no_text");
    expect(await count()).toBe(before);
  });

  it("reports a second load as existing and writes nothing", async () => {
    const before = await count();
    for (const row of [row2023, row2026, tldrOnly]) {
      const again = await ingestNeuripsRow(db, rowOf(row)!, { set: SET });
      expect(again.status).toBe("ok");
      expect(again.created).toBe(false);
    }
    expect(await count()).toBe(before);
  });

  it("keeps the first of two rows that share an id", async () => {
    const first = await ingestNeuripsRow(db, rowOf({ ...row2026, id: "dup1", abstract: "The first telling of a duplicated paper." })!, { set: SET });
    const second = await ingestNeuripsRow(db, rowOf({ ...row2026, id: "dup1", abstract: "A second telling under the same id." })!, { set: SET });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.artifactId).toBe(first.artifactId);
    const [text] = await db.select().from(artifactTexts).where(eq(artifactTexts.artifactId, first.artifactId!));
    expect(text.canonicalText).toBe("The first telling of a duplicated paper.");
  });
});

describe("readCorpusSheet", () => {
  it("yields header-keyed rows from the Corpus sheet", async () => {
    const rows = [];
    for await (const row of readCorpusSheet(path.join(__dirname, "__fixtures__", "corpus.xlsx"))) rows.push(row);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.id)).toEqual(["w0H2xGHlkw", "154295", "tldrOnly1"]);
    expect(rows[0]).toMatchObject({ year: 2023, rating_avg: 6.25, openreview: "https://openreview.net/forum?id=w0H2xGHlkw" });
    expect(rows[1]).not.toHaveProperty("rating_avg");
  });
});
