import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { artifactTexts, document } from "@/db/schema";
import { ingestLine } from "./ingest";
import {
  fieldOfCpc,
  ingestPatent,
  patentNumberOf,
  patentQuery,
  provenanceOfPatent,
  searchPatents,
  type PatentsViewPatent,
} from "./patentsview";

const coldChain: PatentsViewPatent = {
  patent_id: "11223344",
  patent_title: "Cold chain sensor tag",
  patent_abstract: "A  sensor tag records the temperature of a perishable shipment and reports any excursion over a cold chain.",
  patent_date: "2022-03-15",
  assignees: [{ assignee_organization: "Frostline Inc." }, { assignee_organization: null }],
  inventors: [
    { inventor_name_first: "Ada", inventor_name_last: "Lovelace" },
    { inventor_name_first: null, inventor_name_last: "Babbage" },
  ],
  cpc_current: [
    { cpc_section_id: "G", cpc_group_id: "G01K1/02" },
    { cpc_section_id: "B", cpc_group_id: "B65D79/02" },
    { cpc_section_id: "G", cpc_group_id: "G01K1/02" },
  ],
};

const noAbstract: PatentsViewPatent = { patent_id: "11000000", patent_title: "Withheld", patent_abstract: null, patent_date: "2021-01-05" };

/** A fake PatentsView: records every request, answers each `after` with a page or a status. */
function fakePatentsView(pages: Record<string, { patents: PatentsViewPatent[] } | number>) {
  const calls: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { o?: { after?: string } };
    calls.push({ url: String(input), headers: new Headers(init?.headers), body: body as Record<string, unknown> });
    const page = pages[body.o?.after ?? ""];
    if (page === undefined) return new Response("no such page", { status: 400 });
    if (typeof page === "number") return new Response("slow down", { status: page });
    return new Response(JSON.stringify({ error: false, count: page.patents.length, patents: page.patents }), { status: 200 });
  }) as typeof fetch;
  return { impl, calls };
}

const noWait = async () => {};

describe("the query", () => {
  it("matches every word of the query in the title or abstract, granted since a year", () => {
    expect(patentQuery({ query: "cold chain sensor", since: 2018 })).toEqual({
      _and: [
        { _gte: { patent_date: "2018-01-01" } },
        { _or: [{ _text_all: { patent_title: "cold chain sensor" } }, { _text_all: { patent_abstract: "cold chain sensor" } }] },
      ],
    });
    expect(patentQuery({ query: "cold chain" })).toEqual({
      _or: [{ _text_all: { patent_title: "cold chain" } }, { _text_all: { patent_abstract: "cold chain" } }],
    });
  });

  it("posts the query with the key, the fields, a stable sort and the cursor", async () => {
    const { impl, calls } = fakePatentsView({ "": { patents: [coldChain] }, "11223344": { patents: [] } });
    // A short page is the last one: no second request.
    const result = await searchPatents({ query: "cold chain sensor", since: 2018, apiKey: "k-123", fetchImpl: impl, wait: noWait }, async () => {});
    expect(result).toEqual({ seen: 1, stopped: false, cursor: null });
    expect(calls).toHaveLength(1);
    const resumed = await searchPatents({ query: "cold chain sensor", cursor: "11223344", limit: 5, apiKey: "k-123", fetchImpl: impl, wait: noWait }, async () => {});
    expect(resumed).toEqual({ seen: 0, stopped: false, cursor: null });
    expect(calls[0].url).toBe("https://search.patentsview.org/api/v1/patent/");
    expect(calls[0].headers.get("x-api-key")).toBe("k-123");
    expect(calls[0].body).toMatchObject({
      q: patentQuery({ query: "cold chain sensor", since: 2018 }),
      s: [{ patent_id: "asc" }],
      o: { size: 1000 },
    });
    expect(calls[0].body.f).toEqual(expect.arrayContaining(["patent_id", "patent_title", "patent_abstract", "patent_date", "assignees.assignee_organization", "inventors.inventor_name_last", "cpc_current.cpc_section_id", "cpc_current.cpc_group_id"]));
    expect(calls[1].body.o).toEqual({ size: 5, after: "11223344" });
  });

  it("follows the cursor while pages are full, and hands back where a limit stopped it", async () => {
    const other = { ...coldChain, patent_id: "11223399" };
    const { impl, calls } = fakePatentsView({ "": { patents: [coldChain] }, "11223344": { patents: [other] } });
    const seen: string[] = [];
    const result = await searchPatents({ query: "q", limit: 2, pageSize: 1, apiKey: "k", fetchImpl: impl, wait: noWait }, async (p) => void seen.push(p.patent_id!));
    expect(seen).toEqual(["11223344", "11223399"]);
    expect(calls.map((c) => c.body.o)).toEqual([{ size: 1 }, { size: 1, after: "11223344" }]);
    expect(result).toEqual({ seen: 2, stopped: false, cursor: "11223399" });
  });

  it("stops on a 429 with the cursor of the page it could not read", async () => {
    const { impl } = fakePatentsView({ "11223344": 429 });
    const result = await searchPatents({ query: "q", cursor: "11223344", apiKey: "k", fetchImpl: impl, wait: noWait }, async () => {});
    expect(result).toMatchObject({ seen: 0, stopped: true, cursor: "11223344" });
    expect(result.reason).toMatch(/429/);
  });

  it("refuses to start without a key", async () => {
    await expect(searchPatents({ query: "q", apiKey: "", wait: noWait }, async () => {})).rejects.toThrow(/PATENTSVIEW_API_KEY/);
  });
});

describe("reading a patent", () => {
  it("names the CPC section", () => {
    expect(fieldOfCpc("G")).toBe("G — Physics");
    expect(fieldOfCpc("A")).toBe("A — Human necessities");
    expect(fieldOfCpc("H")).toBe("H — Electricity");
    expect(fieldOfCpc("Z")).toBeNull();
    expect(fieldOfCpc(null)).toBeNull();
  });

  it("records number, url, assignees, inventors, cpc, year and field", () => {
    expect(provenanceOfPatent(coldChain)).toEqual({
      patent_number: "11223344",
      url: "https://patents.google.com/patent/US11223344",
      assignees: ["Frostline Inc."],
      inventors: ["Ada Lovelace", "Babbage"],
      cpc: ["G01K1/02", "B65D79/02"],
      year: 2022,
      field: "G — Physics",
    });
  });

  it("reads a patent number in the forms a person pastes", () => {
    expect(patentNumberOf("11223344")).toBe("11223344");
    expect(patentNumberOf("US11223344B2")).toBe("11223344");
    expect(patentNumberOf("US 11,223,344")).toBe("11223344");
    expect(patentNumberOf("D912345")).toBe("D912345");
    expect(patentNumberOf("USD912345S1")).toBe("D912345");
    expect(patentNumberOf("RE48000E1")).toBe("RE48000");
  });
});

describe("ingestPatent", () => {
  let db: Db;
  beforeAll(async () => {
    db = await createPgliteDb();
  });
  const from = (patents: Record<string, PatentsViewPatent | null>) => ({ fetchPatent: async (n: string) => patents[n] ?? null });

  it("writes a patent document with its abstract and provenance", async () => {
    const result = await ingestPatent(db, "11223344", { ...from({ "11223344": coldChain }), provenance: { query_set: "cold-chain", query: "cold chain sensor" } });
    expect(result).toMatchObject({ status: "ok", created: true });
    const [doc] = await db.select().from(document).where(eq(document.id, result.artifactId!));
    expect(doc).toMatchObject({ source: "patent", sessionId: null, title: "Cold chain sensor tag" });
    expect(doc.text).toBeNull();
    const [text] = await db.select().from(artifactTexts).where(eq(artifactTexts.artifactId, doc.id));
    expect(text.canonicalText).toBe("A sensor tag records the temperature of a perishable shipment and reports any excursion over a cold chain.");
    expect(text.sourceFormat).toBe("abstract");
    expect(text.parser).toBe("patentsview-abstract-v1");
    expect(text.provenance).toMatchObject({ patent_number: "11223344", field: "G — Physics", query_set: "cold-chain" });
  });

  it("answers a second ingest of the same number from the stored row, without fetching", async () => {
    const docs = (await db.select().from(document)).length;
    const texts = (await db.select().from(artifactTexts)).length;
    let fetched = 0;
    const again = await ingestPatent(db, "US11223344B2", { fetchPatent: async () => (fetched++, coldChain) });
    expect(again).toMatchObject({ status: "ok", created: false });
    expect(fetched).toBe(0);
    // A search result carries the patent itself; its number is checked before any write.
    const searched = await ingestPatent(db, "11223344", { fetchPatent: async () => coldChain });
    expect(searched.created).toBe(false);
    expect((await db.select().from(document)).length).toBe(docs);
    expect((await db.select().from(artifactTexts)).length).toBe(texts);
  });

  it("reports a patent without an abstract and writes nothing", async () => {
    const docs = (await db.select().from(document)).length;
    const result = await ingestPatent(db, "11000000", from({ "11000000": noAbstract }));
    expect(result.status).toBe("no_abstract");
    expect(ingestLine(result)).toBe("11000000 no_abstract");
    expect((await db.select().from(document)).length).toBe(docs);
  });

  it("reports a number PatentsView does not know", async () => {
    expect((await ingestPatent(db, "99999999", from({}))).status).toBe("not_found");
  });
});

describe("the minimum abstract for a patent", () => {
  it("refuses a fragment as short_abstract when asked", async () => {
    const db = await createPgliteDb();
    const stub: PatentsViewPatent = { ...coldChain, patent_id: "11555555", patent_abstract: "A tag." };
    expect((await ingestPatent(db, "11555555", { fetchPatent: async () => stub, minWords: 30 })).status).toBe("short_abstract");
    expect(await db.select().from(document)).toHaveLength(0);
  });
});
