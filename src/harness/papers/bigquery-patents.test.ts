import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { artifactTexts, document } from "@/db/schema";
import {
  bigqueryClient,
  BIGQUERY_MAX_BYTES_DEFAULT,
  ingestPatent,
  PATENT_PARSER,
  patentFetcher,
  patentQuery,
  provenanceOfPatent,
  searchPatents,
  type PatentJobClient,
  type PatentQuery,
  type PatentRow,
} from "./bigquery-patents";
import { ingestLine } from "./ingest";

const coldChain: PatentRow = {
  publication_number: "US-11223344-B2",
  title: "Cold chain sensor tag",
  abstract: "A  sensor tag records the temperature of a perishable shipment and reports any excursion over a cold chain.",
  grant_date: 20220315,
  assignees: ["Frostline Inc.", ""],
  inventors: ["Ada Lovelace", "Babbage"],
  cpc_first: "G01K1/02",
  // Array order is not primary-first; `cpc_first` is.
  cpc: ["B65D79/02", "G01K1/02", "G01K1/02"],
};

const noAbstract: PatentRow = { ...coldChain, publication_number: "US-11000000-B1", title: "Withheld", abstract: null, grant_date: 20210105 };

/** A fake BigQuery: records every job and every page request, answers each
 *  page token with rows and the next token, or throws. */
function fakeBigQuery(pages: Record<string, { rows: PatentRow[]; next?: string } | Error>, jobId = "job-1") {
  const jobs: PatentQuery[] = [];
  const reads: { jobId: string; maxResults: number; pageToken?: string }[] = [];
  const client: PatentJobClient = {
    async createQueryJob(query) {
      jobs.push(query);
      return jobId;
    },
    async getQueryResults(id, page) {
      reads.push({ jobId: id, ...page });
      const answer = pages[page.pageToken ?? ""];
      if (answer === undefined) throw new Error(`no such page: ${page.pageToken}`);
      if (answer instanceof Error) throw answer;
      return { rows: answer.rows.slice(0, page.maxResults), pageToken: answer.next ?? null, totalBytesProcessed: 123_456_789 };
    },
  };
  return { client, jobs, reads };
}

describe("the query", () => {
  it("matches the query as a phrase in the English title or abstract, granted since a date", () => {
    const q = patentQuery({ query: "Cold  chain\tsensor", since: 2018 });
    expect(q.params).toEqual({ since: 20180101, pattern: "cold\\s+chain\\s+sensor" });
    expect(q.sql).toMatch(/`patents-public-data\.patents\.publications`/);
    expect(q.sql).toMatch(/country_code = 'US'/);
    expect(q.sql).toMatch(/grant_date >= @since/);
    expect(q.sql).toMatch(/regexp_contains\([^]*@pattern\)/);
    expect(q.sql).toMatch(/language = 'en'/);
    expect(q.sql).toMatch(/order by p\.grant_date desc, p\.publication_number/);
    expect(q.maximumBytesBilled).toBe(BIGQUERY_MAX_BYTES_DEFAULT);
  });

  it("escapes the query so a metacharacter is a character, and takes the cap from the environment", () => {
    expect(patentQuery({ query: "C++ (fast)", since: null }, { BIGQUERY_MAX_BYTES: "1000" }).params).toEqual({ since: 0, pattern: "c\\+\\+\\s+\\(fast\\)" });
    expect(patentQuery({ query: "x" }, { BIGQUERY_MAX_BYTES: "1000" }).maximumBytesBilled).toBe(1000);
    expect(patentQuery({ query: "x" }, { BIGQUERY_MAX_BYTES: "lots" }).maximumBytesBilled).toBe(BIGQUERY_MAX_BYTES_DEFAULT);
  });

  it("runs one job, pages its results by token, and says what the job scanned", async () => {
    const other = { ...coldChain, publication_number: "US-11223399-B2" };
    const { client, jobs, reads } = fakeBigQuery({ "": { rows: [coldChain], next: "t2" }, t2: { rows: [other] } });
    const seen: string[] = [];
    const pages: { cursor: string; works: number }[] = [];
    const scanned: unknown[] = [];
    const result = await searchPatents(
      { query: "cold chain sensor", since: 2018, client, pageSize: 1, onPage: (p) => pages.push(p), onJob: (j) => scanned.push(j) },
      async (row) => void seen.push(row.publication_number),
    );
    expect(result).toEqual({ seen: 2, stopped: false, cursor: null });
    expect(seen).toEqual(["US-11223344-B2", "US-11223399-B2"]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toEqual(patentQuery({ query: "cold chain sensor", since: 2018 }));
    expect(reads).toEqual([
      { jobId: "job-1", maxResults: 1 },
      { jobId: "job-1", maxResults: 1, pageToken: "t2" },
    ]);
    expect(pages).toEqual([
      { cursor: "start", works: 1 },
      { cursor: "job-1:t2", works: 1 },
    ]);
    expect(scanned).toEqual([{ jobId: "job-1", totalBytesProcessed: 123_456_789 }]);
  });

  it("hands back the page token where a limit stopped it, and resumes there without a new job", async () => {
    const { client, jobs, reads } = fakeBigQuery({ "": { rows: [coldChain], next: "t2" }, t2: { rows: [coldChain], next: "t3" }, t3: { rows: [] } });
    const first = await searchPatents({ query: "q", client, limit: 1 }, async () => {});
    expect(first).toEqual({ seen: 1, stopped: false, cursor: "job-1:t2" });
    expect(jobs).toHaveLength(1);

    const resumed = await searchPatents({ query: "q", client, cursor: "job-1:t2", limit: 5 }, async () => {});
    expect(resumed).toEqual({ seen: 1, stopped: false, cursor: null });
    expect(jobs).toHaveLength(1);
    expect(reads.slice(1)).toEqual([
      { jobId: "job-1", maxResults: 5, pageToken: "t2" },
      { jobId: "job-1", maxResults: 4, pageToken: "t3" },
    ]);
  });

  it("stops on a failed page with the cursor that would retry it", async () => {
    const { client } = fakeBigQuery({ "": { rows: [coldChain], next: "t2" }, t2: new Error("quota exceeded") });
    const result = await searchPatents({ query: "q", client }, async () => {});
    expect(result).toEqual({ seen: 1, stopped: true, cursor: "job-1:t2", reason: "quota exceeded" });
  });

  it("stops before any page when the job is refused", async () => {
    const client: PatentJobClient = {
      createQueryJob: async () => {
        throw new Error("Query exceeded limit for bytes billed");
      },
      getQueryResults: async () => {
        throw new Error("unreachable");
      },
    };
    const result = await searchPatents({ query: "q", client }, async () => {});
    expect(result).toEqual({ seen: 0, stopped: true, cursor: null, reason: "Query exceeded limit for bytes billed" });
  });

  it("refuses to start without credentials, naming them", async () => {
    expect(bigqueryClient({})).toBeNull();
    expect(bigqueryClient({ GOOGLE_CLOUD_PROJECT: "p" })).toBeNull();
    expect(bigqueryClient({ GOOGLE_APPLICATION_CREDENTIALS_JSON: "{}" })).toBeNull();
    await expect(searchPatents({ query: "q", env: {} }, async () => {})).rejects.toThrow(/GOOGLE_CLOUD_PROJECT.*GOOGLE_APPLICATION_CREDENTIALS_JSON/);
  });
});

describe("a fetcher for a list of numbers", () => {
  it("runs one job for the whole list on first use, keyed by number", async () => {
    const { client, jobs, reads } = fakeBigQuery({ "": { rows: [coldChain] } });
    const fetch = patentFetcher(["US11223344B2", "99999999"], { client });
    expect(jobs).toHaveLength(0);
    expect(await fetch("11223344")).toEqual(coldChain);
    expect(await fetch("99999999")).toBeNull();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].params).toEqual({ numbers: ["11223344", "99999999"] });
    expect(jobs[0].sql).toMatch(/unnest\(@numbers\)/);
    expect(reads).toHaveLength(1);
  });
});

describe("reading a patent", () => {
  it("records number, url, assignees, inventors, cpc, year and field from the primary code", () => {
    expect(provenanceOfPatent(coldChain)).toEqual({
      patent_number: "11223344",
      url: "https://patents.google.com/patent/US11223344",
      assignees: ["Frostline Inc."],
      inventors: ["Ada Lovelace", "Babbage"],
      cpc: ["B65D79/02", "G01K1/02"],
      year: 2022,
      field: "G — Physics",
    });
  });

  it("has no year or field when BigQuery gives none", () => {
    expect(provenanceOfPatent({ ...coldChain, grant_date: 0, cpc_first: null, cpc: [] })).toMatchObject({ year: null, field: null, cpc: [] });
  });
});

describe("ingestPatent", () => {
  let db: Db;
  beforeAll(async () => {
    db = await createPgliteDb();
  });
  const from = (rows: Record<string, PatentRow | null>) => ({ fetchPatent: async (n: string) => rows[n] ?? null });

  it("writes a patent document with its abstract and provenance", async () => {
    const result = await ingestPatent(db, "US-11223344-B2", { ...from({ "US-11223344-B2": coldChain }), provenance: { query_set: "cold-chain", query: "cold chain sensor" } });
    expect(result).toMatchObject({ status: "ok", created: true });
    const [doc] = await db.select().from(document).where(eq(document.id, result.artifactId!));
    expect(doc).toMatchObject({ source: "patent", sessionId: null, title: "Cold chain sensor tag" });
    expect(doc.text).toBeNull();
    const [text] = await db.select().from(artifactTexts).where(eq(artifactTexts.artifactId, doc.id));
    expect(text.canonicalText).toBe("A sensor tag records the temperature of a perishable shipment and reports any excursion over a cold chain.");
    expect(text.sourceFormat).toBe("abstract");
    expect(text.parser).toBe(PATENT_PARSER);
    expect(text.provenance).toEqual({
      patent_number: "11223344",
      url: "https://patents.google.com/patent/US11223344",
      assignees: ["Frostline Inc."],
      inventors: ["Ada Lovelace", "Babbage"],
      cpc: ["B65D79/02", "G01K1/02"],
      year: 2022,
      field: "G — Physics",
      query_set: "cold-chain",
      query: "cold chain sensor",
    });
  });

  it("answers the same patent under the old source's bare number from the stored row, without fetching", async () => {
    const docs = (await db.select().from(document)).length;
    const texts = (await db.select().from(artifactTexts)).length;
    let fetched = 0;
    const again = await ingestPatent(db, "11223344", { fetchPatent: async () => (fetched++, coldChain) });
    expect(again).toMatchObject({ status: "ok", created: false });
    expect(fetched).toBe(0);
    // A search result carries the row itself; its number is checked before any write.
    const searched = await ingestPatent(db, "US-11223344-B2", { fetchPatent: async () => coldChain });
    expect(searched.created).toBe(false);
    expect(ingestLine(searched)).toMatch(/^US-11223344-B2 /);
    expect((await db.select().from(document)).length).toBe(docs);
    expect((await db.select().from(artifactTexts)).length).toBe(texts);
  });

  it("reports a patent without an English abstract and writes nothing", async () => {
    const docs = (await db.select().from(document)).length;
    const result = await ingestPatent(db, "US-11000000-B1", from({ "US-11000000-B1": noAbstract }));
    expect(result.status).toBe("no_abstract");
    expect(ingestLine(result)).toBe("US-11000000-B1 no_abstract");
    expect((await db.select().from(document)).length).toBe(docs);
  });

  it("reports a number BigQuery does not hold", async () => {
    expect((await ingestPatent(db, "99999999", from({}))).status).toBe("not_found");
  });

  it("refuses a fragment as short_abstract when asked", async () => {
    const stub: PatentRow = { ...coldChain, publication_number: "US-11555555-B2", abstract: "A tag." };
    const docs = (await db.select().from(document)).length;
    expect((await ingestPatent(db, "11555555", { fetchPatent: async () => stub, minWords: 30 })).status).toBe("short_abstract");
    expect((await db.select().from(document)).length).toBe(docs);
  });
});
