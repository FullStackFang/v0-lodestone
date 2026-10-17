/** Card search with every source faked: the queries it builds, which blocks
 *  it plans, what it ingests and records, and the state a client reads. */
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { COHORT, forgeDocument } from "../../evals/lodestone/cohort";
import { createPgliteDb, type Db } from "@/db/client";
import { artifactTexts, cardRank, cardSearch, document, documentChunk, documentSentence } from "@/db/schema";
import { putArtifactText } from "@/harness/canonical";
import { ensurePerson } from "@/harness/ledger";
import type { OpenAlexWork } from "@/harness/papers/openalex";
import type { SearchOptions } from "@/harness/papers/search";
import { enrollTestMember } from "@/pilot/test-fixtures";
import { cardBlocks, importCard, type CardBlock } from "./cards";
import {
  CARD_SEARCH_QUERY_SET,
  PROVENANCE_KEYS,
  STALE_MS,
  blockHashes,
  changesFor,
  plannedBlocks,
  queryFor,
  searchCard,
  searchState,
  type SearchDeps,
} from "./search";
import { recordFeedback } from "./api";
import { embedPaperAbstracts, priorArtFor } from "./priorArt";
import { withSentences } from "./sentences";
import { testEmbed, testVector } from "./test-embed";
import { cosine } from "./vectors";

const block = (key: string, label: string, texts: string[]): CardBlock => ({
  key,
  label,
  entries: texts.map((text) => ({ text, origin: "confirmed", evidence: null, segment: null })),
});

describe("queryFor", () => {
  const vp = block("value_proposition", "Value proposition", ["Booked study rooms released when nobody shows", "Rooms handed to the waitlist"]);

  it("leads the semantic query with the purpose, then the block", () => {
    const q = queryFor(vp, { l1: "x", l2: "Reallocate a reserved shared resource when the holder fails to appear" });
    expect(q.semantic).toBe(
      "Reallocate a reserved shared resource when the holder fails to appear. Value proposition: Booked study rooms released when nobody shows; Rooms handed to the waitlist",
    );
  });

  it("is the block alone without a purpose", () => {
    expect(queryFor(vp, null).semantic).toBe("Value proposition: Booked study rooms released when nobody shows; Rooms handed to the waitlist");
  });

  it("trims the entries, never the purpose, to 2,000 characters", () => {
    const l2 = "p".repeat(300);
    const long = block("channels", "Channels", ["word ".repeat(1000)]);
    const q = queryFor(long, { l1: "", l2 });
    expect(q.semantic.length).toBe(2000);
    expect(q.semantic.startsWith(`${l2}. Channels: `)).toBe(true);
  });

  it("keys on at most eight content words, most frequent across the card first", () => {
    const card = [vp, block("customer_segments", "Customer segments", ["Students who need study rooms during finals"])];
    const q = queryFor(vp, null, card);
    const words = q.keyword.split(" ");
    expect(words.length).toBeLessThanOrEqual(8);
    expect(words.slice(0, 2)).toEqual(["rooms", "study"]);
    expect(words).not.toContain("when");
    expect(words).not.toContain("the");
  });
});

describe("blockHashes", () => {
  it("hashes each block with entries by its key, and only those", () => {
    const doc = forgeDocument(COHORT[0]);
    const hashes = blockHashes(doc);
    const withEntries = cardBlocks(doc).blocks.filter((b) => b.entries.length > 0).map((b) => b.key);
    expect([...hashes.keys()].sort()).toEqual(withEntries.sort());
    for (const h of hashes.values()) expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

// --- The database half. ---

let db: Db;
let ownerId: string;
const member = COHORT[0];

beforeAll(async () => {
  db = await createPgliteDb();
  ownerId = await ensurePerson(db, { name: member.name, email: member.email });
  await enrollTestMember(db, ownerId);
}, 60_000);

/** OpenAlex's inverted index for a text: each word with every position it holds. */
function invert(text: string): Record<string, number[]> {
  const index: Record<string, number[]> = {};
  text.split(" ").forEach((w, i) => (index[w] ??= []).push(i));
  return index;
}
const abstract = (n: number) =>
  `Study ${n} examines how a shared reservation system releases rooms that were booked but left empty, and how often the next group in the queue takes them up within ten minutes across three campus libraries over two semesters.`;
const work = (n: number, doi?: string): OpenAlexWork => ({
  id: `https://openalex.org/W${9000 + n}`,
  doi: doi ? `https://doi.org/${doi}` : null,
  title: `Work ${n}`,
  publication_year: 2020,
  type: "article",
  primary_location: { source: { display_name: "Journal of Shared Spaces", type: "journal" } },
  abstract_inverted_index: invert(abstract(n)),
});
/** Typed `article` by OpenAlex but with no source: a library guide page. */
const guide: OpenAlexWork = { ...work(5), primary_location: { source: null } };

/** Fakes for the three sources, recording what each was asked. */
function fakes(over: Partial<SearchDeps> = {}) {
  const asked: { semantic: string[]; keyword: string[]; s2: string[] } = { semantic: [], keyword: [], s2: [] };
  const deps: SearchDeps = {
    searchWorks: async (options: SearchOptions, onWork: (w: OpenAlexWork) => Promise<void>) => {
      expect(options.scholarly).toBe(true);
      (options.semantic ? asked.semantic : asked.keyword).push(options.query);
      const works = options.semantic ? [work(1), work(2), guide] : [work(2), work(3)];
      for (const w of works) await onWork(w);
      return { seen: works.length, stopped: false, cursor: null };
    },
    searchS2: async ({ query }) => {
      asked.s2.push(query);
      return { hits: [{ doi: "10.5555/s2.one", tldr: "Release empty rooms." }], skippedNoDoi: 1 };
    },
    fetchWork: async (id: string) => (id.includes("10.5555/s2.one") ? work(4, "10.5555/s2.one") : null),
    embed: testEmbed,
    now: () => new Date(),
    ...over,
  };
  return { deps, asked };
}

async function importMember(doc: Record<string, unknown>) {
  await importCard(db, { id: ownerId, email: member.email }, doc, testEmbed);
}

describe("searchCard", () => {
  it("searches every block with entries, ingests the union once, and records each block", async () => {
    const doc = forgeDocument(member);
    await importMember(doc);
    const { deps, asked } = fakes();
    await searchCard(db, member.ideaId, deps);

    const planned = blockHashes(doc).size;
    expect(asked.semantic).toHaveLength(planned);
    expect(asked.keyword).toHaveLength(planned);
    expect(asked.s2).toHaveLength(planned);

    const rows = await db.select().from(cardSearch).where(eq(cardSearch.ideaId, member.ideaId));
    expect(rows).toHaveLength(planned);
    expect(rows.every((r) => r.state === "done" && r.finishedAt)).toBe(true);
    // Four distinct works across all blocks; the first block finds them new.
    expect(rows.reduce((n, r) => n + r.found, 0)).toBe(4);
    const first = rows.find((r) => r.found > 0)!;
    expect(first.sources.openalex_semantic).toMatchObject({ new: 2, existing: 0, skipped_not_scholarly: 1 });
    expect(first.sources.openalex_keyword).toMatchObject({ new: 1, existing: 1 });
    expect(first.sources.s2).toMatchObject({ new: 1, existing: 0, skipped_no_doi: 1 });

    const state = await searchState(db, member.ideaId, doc);
    expect(state).toMatchObject({ state: "done", found: 4, abstracted: false });
  });

  it("stores no card text in a searched-in paper's provenance", async () => {
    const texts = await db.select({ provenance: artifactTexts.provenance }).from(artifactTexts);
    const searched = texts.filter((t) => t.provenance.query_set === CARD_SEARCH_QUERY_SET);
    expect(searched).toHaveLength(4);
    for (const t of searched) for (const key of Object.keys(t.provenance)) expect(PROVENANCE_KEYS).toContain(key);
    expect(searched.find((t) => t.provenance.doi === "10.5555/s2.one")?.provenance.tldr).toBe("Release empty rooms.");
  });

  it("cuts the sentences of the card's top hits once the search is done, so a read embeds nothing", async () => {
    const searched = await db.select({ id: artifactTexts.artifactId, hash: artifactTexts.textHash, provenance: artifactTexts.provenance }).from(artifactTexts);
    const cut = await db.selectDistinct({ id: documentSentence.documentId, hash: documentSentence.textHash }).from(documentSentence);
    // None of the four works has a field, one bucket, so the quota keeps three.
    const ids = (await priorArtFor(db, member.ideaId, 10)).map((h) => h.documentId).sort();
    expect(ids).toHaveLength(3);
    expect(cut.map((c) => c.id).sort()).toEqual(ids);
    for (const c of cut) expect(searched.find((t) => t.id === c.id)?.hash).toBe(c.hash);
  });

  it("searches again only the block that changed", async () => {
    const changed = { ...member, entries: member.entries.map((e, i) => (i === 0 ? { ...e, text: `${e.text} on weekends` } : e)) };
    const doc = forgeDocument(changed);
    await importMember(doc);
    const plan = await plannedBlocks(db, member.ideaId, doc);
    expect(plan.map((b) => b.key)).toEqual([member.entries[0].block]);
    const { deps, asked } = fakes();
    await searchCard(db, member.ideaId, deps);
    expect(asked.semantic).toHaveLength(1);
  });

  it("re-plans a block stuck running past the stale window, and drops an emptied block", async () => {
    const doc = forgeDocument(member);
    await importMember(doc);
    await searchCard(db, member.ideaId, fakes().deps);
    const stuck = member.entries[1].block;
    await db
      .update(cardSearch)
      .set({ state: "running", startedAt: new Date(Date.now() - STALE_MS - 1000) })
      .where(and(eq(cardSearch.ideaId, member.ideaId), eq(cardSearch.block, stuck)));
    expect(await searchState(db, member.ideaId, doc)).toMatchObject({ state: "stale" });
    expect((await plannedBlocks(db, member.ideaId, doc)).map((b) => b.key)).toEqual([stuck]);

    const emptied = member.entries[2].block;
    const fewer = forgeDocument({ ...member, entries: member.entries.filter((e) => e.block !== emptied) });
    await importMember(fewer);
    await plannedBlocks(db, member.ideaId, fewer);
    const blocks = (await db.select().from(cardSearch).where(eq(cardSearch.ideaId, member.ideaId))).map((r) => r.block);
    expect(blocks).not.toContain(emptied);
  });

  it("records a source's failure in its row and carries on", async () => {
    const doc = forgeDocument({ ...member, entries: member.entries.map((e) => ({ ...e, text: `${e.text} again` })) });
    await importMember(doc);
    const { deps } = fakes({
      searchS2: async () => ({ hits: [], skippedNoDoi: 0, error: "s2 429: Too Many Requests" }),
      searchWorks: async () => {
        throw new Error("network down");
      },
    });
    await expect(searchCard(db, member.ideaId, deps)).resolves.toBeUndefined();
    const [row] = await db.select().from(cardSearch).where(eq(cardSearch.ideaId, member.ideaId)).limit(1);
    expect(row.state).toBe("done");
    expect(row.sources.s2.error).toMatch(/429/);
    expect(row.sources.openalex_semantic.error).toMatch(/network down/);
  });

  it("leads with the purpose and reports abstracted for a /5 card", async () => {
    const other = COHORT[1];
    const id = await ensurePerson(db, { name: other.name, email: other.email });
    const doc = { ...forgeDocument(other), format: "forge-idea/5", already_have: [], purpose: { l1: "Help one group", l2: "Match supply to uncertain demand", extra: "dropped" } };
    await importCard(db, { id, email: other.email }, doc, testEmbed);
    const { deps, asked } = fakes();
    await searchCard(db, other.ideaId, deps);
    expect(asked.semantic.every((q) => q.startsWith("Match supply to uncertain demand. "))).toBe(true);
    expect(await searchState(db, other.ideaId, doc)).toMatchObject({ abstracted: true });
  });

  it("keeps a Semantic Scholar hit with no abstract as thin on its TLDR, and replaces it once the abstract arrives", async () => {
    const other = COHORT[2];
    const id = await ensurePerson(db, { name: other.name, email: other.email });
    const doc = forgeDocument(other);
    await importCard(db, { id, email: other.email }, doc, testEmbed);
    const withheld = { ...work(6, "10.5555/s2.thin"), abstract_inverted_index: undefined };
    const tldr = "Empty booked rooms go to the waitlist.";
    const quiet = (fetchWork: SearchDeps["fetchWork"]) =>
      fakes({
        searchWorks: async () => ({ seen: 0, stopped: false, cursor: null }),
        searchS2: async () => ({ hits: [{ doi: "10.5555/s2.thin", tldr }], skippedNoDoi: 0 }),
        fetchWork,
      }).deps;
    await searchCard(db, other.ideaId, quiet(async () => withheld));

    const texts = () => db.select().from(artifactTexts).where(eq(artifactTexts.sourceFormat, "tldr"));
    const [thin] = await texts();
    expect(thin).toMatchObject({ canonicalText: tldr, provenance: expect.objectContaining({ thin: true, tldr, doi: "10.5555/s2.thin", query_set: CARD_SEARCH_QUERY_SET }) });
    for (const key of Object.keys(thin.provenance)) expect(PROVENANCE_KEYS).toContain(key);
    const first = (await db.select().from(cardSearch).where(eq(cardSearch.ideaId, other.ideaId))).find((r) => r.found > 0)!;
    expect(first.sources.s2).toMatchObject({ new: 1, existing: 0 });
    // Embedded on its TLDR: the hit is ready to read, marked thin, its one
    // sentence the TLDR at the hit's own score, with nothing cut for it.
    expect(await db.select().from(documentChunk).where(eq(documentChunk.documentId, thin.artifactId))).toHaveLength(1);
    // The quota off: every faked work shares the null field bucket.
    const hits = await withSentences(db, testEmbed, other.ideaId, await priorArtFor(db, other.ideaId, 50, { perField: Infinity }));
    const hit = hits.find((h) => h.documentId === thin.artifactId)!;
    expect(hit).toMatchObject({ thin: true, abstractHash: thin.textHash, sentences: [{ text: tldr, block: hit.blockKeys[0], cosine: hit.score }] });
    expect(await db.select().from(documentSentence).where(eq(documentSentence.documentId, thin.artifactId))).toHaveLength(0);

    // The next search that returns it finds the abstract on OpenAlex.
    const changed = forgeDocument({ ...other, entries: other.entries.map((e, i) => (i === 0 ? { ...e, text: `${e.text} on weekends` } : e)) });
    await importCard(db, { id, email: other.email }, changed, testEmbed);
    await searchCard(db, other.ideaId, quiet(async () => work(6, "10.5555/s2.thin")));
    expect(await texts()).toHaveLength(0);
    const [full] = await db.select().from(artifactTexts).where(eq(artifactTexts.artifactId, thin.artifactId));
    expect(full).toMatchObject({ sourceFormat: "abstract", canonicalText: abstract(6), provenance: expect.objectContaining({ tldr }) });
    expect(full.provenance).not.toHaveProperty("thin");
    const [chunk] = await db.select().from(documentChunk).where(eq(documentChunk.documentId, thin.artifactId));
    expect(cosine(chunk.embedding!, testVector(abstract(6)))).toBeCloseTo(1, 3);
    expect(cosine(chunk.embedding!, testVector(tldr))).toBeLessThan(0.5);
  });

  it("reports a card with no rows as done with nothing found", async () => {
    expect(await searchState(db, "f".repeat(32), forgeDocument(member))).toEqual({
      state: "done",
      finishedAt: null,
      sources: {},
      found: 0,
      abstracted: false,
    });
  });
});

// --- The pivot diff. ---

describe("the pivot diff", () => {
  const maren = COHORT[4];
  let marenId = "";
  const names = ["amber", "birch", "cedar", "delta", "ember", "fjord", "garnet", "harbor", "indigo", "juniper"];
  const dairy: string[] = [];
  const brewery: string[] = [];
  /** Searches that find nothing: the corpus below is the whole story. */
  const quiet = () =>
    fakes({ searchWorks: async () => ({ seen: 0, stopped: false, cursor: null }), searchS2: async () => ({ hits: [], skippedNoDoi: 0 }) }).deps;
  const ranked = () => priorArtFor(db, maren.ideaId, 10, { viewerId: marenId });
  const snapshots = () => db.select().from(cardRank).where(eq(cardRank.ideaId, maren.ideaId)).orderBy(cardRank.importSeq);
  const pivoted = forgeDocument({
    ...maren,
    entries: maren.entries.map((e) => (e.block === "customer_segments" ? { ...e, text: "Craft breweries cooling wort in small towns" } : e)),
  });

  /** Ten papers on the card's segment and ten on the one it pivots to, each
   *  in a field of its own so the quota keeps all ten. */
  beforeAll(async () => {
    marenId = await ensurePerson(db, { name: maren.name, email: maren.email });
    const paper = async (title: string, abstract: string, field: string) => {
      const [row] = await db.insert(document).values({ sessionId: null, source: "paper", title, text: null }).returning({ id: document.id });
      await putArtifactText(db, { artifactId: row.id, sourceFormat: "abstract", parser: "test", text: abstract, provenance: { field } });
      return row.id;
    };
    for (const n of names) {
      dairy.push(await paper(`Dairy ${n}`, `Dairies under three hundred cows in the Northeast: the ${n} survey.`, `Dairy ${n}`));
      brewery.push(await paper(`Brewery ${n}`, `Craft breweries cooling wort in small towns: the ${n} survey.`, `Brewing ${n}`));
    }
    await embedPaperAbstracts(db, testEmbed);
  });

  it("snapshots the owner's list once per import, when its search is done, with no diff on the first", async () => {
    await importCard(db, { id: marenId, email: maren.email }, forgeDocument(maren), testEmbed);
    expect(await snapshots()).toHaveLength(0);
    await searchCard(db, maren.ideaId, quiet());
    const rows = await snapshots();
    expect(rows).toHaveLength(1);
    expect(rows[0].importSeq).toBe(1);
    expect(rows[0].hits.map((h) => h.documentId)).toEqual((await ranked()).map((h) => h.documentId));
    expect(new Set(rows[0].hits.map((h) => h.documentId))).toEqual(new Set(dairy));
    // A second search of the same import plans nothing and writes nothing.
    await searchCard(db, maren.ideaId, quiet());
    expect(await snapshots()).toHaveLength(1);
    expect(await changesFor(db, maren.ideaId, await ranked())).toBeNull();
  });

  it("names the block that changed, the hits added and dropped, and the verdict a dropped hit had", async () => {
    await recordFeedback(db, marenId, { ideaId: maren.ideaId, kind: "paper", targetId: dairy[0], verdict: "useful" });
    await importCard(db, { id: marenId, email: maren.email }, pivoted, testEmbed);
    // Sent, its search not yet run: the blocks' rows still hold the old text.
    expect(await changesFor(db, maren.ideaId, await ranked())).toBeNull();

    await searchCard(db, maren.ideaId, quiet());
    expect((await snapshots()).map((r) => r.importSeq)).toEqual([1, 2]);
    const hits = await ranked();
    const changes = await changesFor(db, maren.ideaId, hits);
    expect(changes?.since).toBe("2");
    expect(changes?.blocks).toEqual(["customer_segments"]);
    expect(new Set(changes?.added.map((h) => h.documentId))).toEqual(new Set(brewery));
    expect(new Set(changes?.dropped.map((h) => h.documentId))).toEqual(new Set(dairy));
    expect(changes?.dropped.find((h) => h.documentId === dairy[0])?.verdict).toBe("useful");
    expect(changes?.dropped.filter((h) => h.verdict === null)).toHaveLength(9);
    // Dropped, not re-added.
    expect(hits.map((h) => h.documentId)).not.toContain(dairy[0]);
  });

  it("is null while the card's search is running", async () => {
    const where = and(eq(cardSearch.ideaId, maren.ideaId), eq(cardSearch.block, "customer_segments"));
    await db.update(cardSearch).set({ state: "running", startedAt: new Date() }).where(where);
    expect(await changesFor(db, maren.ideaId, await ranked())).toBeNull();
    await db.update(cardSearch).set({ state: "done" }).where(where);
    expect(await changesFor(db, maren.ideaId, await ranked())).not.toBeNull();
  });
});
