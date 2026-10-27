/** The client routes end to end against the in-memory ledger: a token is
 *  minted, a card is sent, read back with its matches, published, and judged.
 *  The handlers run as functions; `getDb()` is the in-memory PGlite under
 *  vitest, so the routes share one database for the file. */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { COHORT, forgeDocument } from "../../../../evals/lodestone/cohort";
import { getDb } from "@/db/client";
import { ensurePerson } from "@/harness/ledger";
import type { OpenAlexWork } from "@/harness/papers/openalex";
import { mintToken } from "@/lodestone/api";
import { CARD_SEARCH_QUERY_SET, PROVENANCE_KEYS, searchCard } from "@/lodestone/search";
import { testEmbed } from "@/lodestone/test-embed";
import { enrollTestMember } from "@/pilot/test-fixtures";

/** `after` callbacks are queued, never run: the real card search would go to
 *  the network. A test that wants a search runs `searchCard` with fakes. */
const queued: (() => unknown)[] = [];
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (task: () => unknown) => void queued.push(task),
}));
/** The routes embed with the hashed bag of words, never Voyage. Imported at
 *  call time: `test-embed` itself imports this module. A test can switch it
 *  to a deployment with no key, or to a provider that throws. */
const embedding = vi.hoisted(() => ({ mode: "ok" as "ok" | "keyless" | "throws" }));
vi.mock("@/harness/embed", async (original) => ({
  ...(await original<typeof import("@/harness/embed")>()),
  embed: async (texts: string[]) => {
    if (embedding.mode === "keyless") return { vectors: texts.map(() => null), embedded: false, model: null, tokens: null };
    if (embedding.mode === "throws") throw new Error("voyage 500: upstream fault");
    return (await import("@/lodestone/test-embed")).testEmbed(texts);
  },
}));
import { GET as me } from "./me/route";
import { GET as listCards, POST as sendCard } from "./cards/route";
import { GET as readCard, PATCH as patchCard } from "./cards/[ideaId]/route";
import { GET as readFeedback, POST as sendFeedback } from "./cards/[ideaId]/feedback/route";
import { GET as readPaper } from "./papers/[documentId]/route";
import { POST as searchPapersRoute } from "./papers/search/route";
import { eq, sql } from "drizzle-orm";
import { artifactTexts, cardRank, document, forgeCard } from "@/db/schema";
import { putArtifactText } from "@/harness/canonical";
import { embedPaperAbstracts } from "@/lodestone/priorArt";

const origin = "https://lodestone.invalid";
const sam = COHORT[0];
let token = "";

const params = (ideaId: string) => ({ params: Promise.resolve({ ideaId }) });
const req = (path: string, init: RequestInit = {}, auth = token) =>
  new Request(`${origin}${path}`, { ...init, headers: { ...(auth ? { authorization: `Bearer ${auth}` } : {}), "content-type": "application/json", ...(init.headers ?? {}) } });

beforeAll(async () => {
  const db = await getDb();
  const id = await ensurePerson(db, { name: sam.name, email: sam.email });
  await enrollTestMember(db, id);
  token = (await mintToken(db, id, "test client")).token;
}, 60_000);

describe("client routes", () => {
  it("answers 401 without a live token", async () => {
    const res = await me(req("/api/lodestone/me", {}, ""));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/token/);
  });
  it("identifies the token's person", async () => {
    const res = await me(req("/api/lodestone/me"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.person.email).toBe(sam.email);
    expect(body.member).toBe(true);
    expect(body.cohort.members).toBeGreaterThanOrEqual(1);
  });
  it("imports a card, then updates it on a second send", async () => {
    const first = await sendCard(req("/api/lodestone/cards", { method: "POST", body: JSON.stringify(forgeDocument(sam)) }));
    expect(first.status).toBe(201);
    const a = await first.json();
    expect(a.created).toBe(true);
    expect(a.card.ideaId).toBe(sam.ideaId);
    expect(a.card.visibility).toBe("private");
    expect(a.filed).toBeGreaterThan(0);
    expect(a.search).toBe("queued");
    expect(queued).toHaveLength(1);
    const second = await sendCard(req("/api/lodestone/cards", { method: "POST", body: JSON.stringify(forgeDocument(sam)) }));
    expect(second.status).toBe(200);
    expect((await second.json()).created).toBe(false);
    const list = await (await listCards(req("/api/lodestone/cards"))).json();
    expect(list.cards.map((c: { ideaId: string }) => c.ideaId)).toEqual([sam.ideaId]);
  });
  it("rejects a body that is not a card", async () => {
    const res = await sendCard(req("/api/lodestone/cards", { method: "POST", body: "{\"format\":\"nope\"}" }));
    expect(res.status).toBe(400);
    const empty = await sendCard(req("/api/lodestone/cards", { method: "POST", body: "" }));
    expect(empty.status).toBe(400);
    expect((await empty.json()).error).toMatch(/empty/);
  });
  it("reads the card back with blocks, matches and feedback for the owner", async () => {
    const res = await readCard(req(`/api/lodestone/cards/${sam.ideaId}`), params(sam.ideaId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.blocks).toHaveLength(9);
    expect(body.member).toBe(true);
    expect(Array.isArray(body.priorArt)).toBe(true);
    expect(Array.isArray(body.peers)).toBe(true);
    expect(body.feedback).toEqual([]);
    // Queued, never run here: no rows, so done with nothing found.
    expect(body.search).toEqual({ state: "done", finishedAt: null, sources: {}, found: 0, abstracted: false });
  });
  it("accepts a forge-idea/5 card and never shows its purpose to another member", async () => {
    const db = await getDb();
    const priya = COHORT[1];
    const priyaId = await ensurePerson(db, { name: priya.name, email: priya.email });
    await enrollTestMember(db, priyaId);
    const priyaToken = (await mintToken(db, priyaId, "test client")).token;
    const doc = { ...forgeDocument(priya), format: "forge-idea/5", already_have: [], purpose: { l1: "Secret one", l2: "Secret two", note: "x" } };
    const sent = await sendCard(req("/api/lodestone/cards", { method: "POST", body: JSON.stringify(doc) }, priyaToken));
    expect(sent.status).toBe(201);
    const pub = await patchCard(req(`/api/lodestone/cards/${priya.ideaId}`, { method: "PATCH", body: JSON.stringify({ visibility: "cohort" }) }, priyaToken), params(priya.ideaId));
    expect(pub.status).toBe(200);
    const own = await (await readCard(req(`/api/lodestone/cards/${priya.ideaId}`, {}, priyaToken), params(priya.ideaId))).json();
    expect(own.search.abstracted).toBe(true);
    const seen = await readCard(req(`/api/lodestone/cards/${priya.ideaId}`), params(priya.ideaId));
    expect(seen.status).toBe(200);
    const text = await seen.text();
    expect(text).not.toMatch(/purpose|Secret one|Secret two/);
  });
  it("serves a searched-in paper with provenance inside the allowlist and no query", async () => {
    const db = await getDb();
    const words = "Groups that reserve a shared room and fail to arrive leave it empty while others queue, and a short grace period before release recovers most of that lost time across a semester of bookings.";
    const index: Record<string, number[]> = {};
    words.split(" ").forEach((w, i) => (index[w] ??= []).push(i));
    const work: OpenAlexWork = { id: "https://openalex.org/W777001", doi: "https://doi.org/10.5555/grace", title: "Grace periods", publication_year: 2022, type: "article", primary_location: { source: { display_name: "Library Quarterly", type: "journal" } }, abstract_inverted_index: index };
    await searchCard(db, sam.ideaId, {
      searchWorks: async (options, onWork) => {
        if (options.semantic) await onWork(work);
        return { seen: 1, stopped: false, cursor: null };
      },
      searchS2: async () => ({ hits: [], skippedNoDoi: 0 }),
      fetchWork: async () => null,
      embed: testEmbed,
      now: () => new Date(),
    });
    const [row] = await db
      .select({ id: artifactTexts.artifactId })
      .from(artifactTexts)
      .where(sql`${artifactTexts.provenance}->>'openalex_id' = ${work.id}`);
    const body = await (await readPaper(req(`/api/lodestone/papers/${row.id}`), { params: Promise.resolve({ documentId: row.id }) })).json();
    expect(body.provenance.query_set).toBe(CARD_SEARCH_QUERY_SET);
    expect(body.provenance).not.toHaveProperty("query");
    for (const key of Object.keys(body.provenance)) expect(PROVENANCE_KEYS).toContain(key);
  });
  it("names each hit's nearest sentences, cut from the abstract under its hash, and re-cuts a replaced one", async () => {
    const db = await getDb();
    const paperParams = (documentId: string) => ({ params: Promise.resolve({ documentId }) });
    const abstract = `${sam.said.join(" ")} We survey four hundred arriving students across three campuses. The deposit held in escrow reduced mid-lease moves.`;
    const [paper] = await db.insert(document).values({ sessionId: null, source: "paper", title: "Sentences under a hash", text: null }).returning({ id: document.id });
    await putArtifactText(db, { artifactId: paper.id, sourceFormat: "abstract", parser: "test", text: abstract, provenance: { query_set: "sentences" } });
    await embedPaperAbstracts(db, testEmbed);

    const hitFor = async () => {
      const body = await (await readCard(req(`/api/lodestone/cards/${sam.ideaId}`), params(sam.ideaId))).json();
      const hit = body.priorArt.find((h: { documentId: string }) => h.documentId === paper.id);
      const read = await (await readPaper(req(`/api/lodestone/papers/${paper.id}`), paperParams(paper.id))).json();
      return { hit, read };
    };
    const first = await hitFor();
    expect(first.hit).toBeDefined();
    expect(first.hit.abstractHash).toBe(first.read.abstractHash);
    expect(first.hit.sentences).toHaveLength(3);
    for (const s of first.hit.sentences) {
      expect(first.read.abstract).toContain(s.text);
      expect(s.block).toBe(first.hit.blockKeys[0]);
      expect(typeof s.cosine).toBe("number");
    }
    const at = first.hit.sentences.map((s: { text: string }) => first.read.abstract.indexOf(s.text));
    expect(at).toEqual([...at].sort((a, b) => a - b));

    const replaced = "Incoming graduate students lease apartments months before arrival without seeing them. A recorded walkthrough from the departing student replaces the visit.";
    await putArtifactText(db, { artifactId: paper.id, sourceFormat: "abstract", parser: "test", text: replaced, provenance: { query_set: "sentences" } });
    const second = await hitFor();
    expect(second.read.abstract).toBe(replaced);
    expect(second.hit.abstractHash).toBe(second.read.abstractHash);
    expect(second.hit.abstractHash).not.toBe(first.hit.abstractHash);
    expect(second.hit.sentences.map((s: { text: string }) => s.text)).toEqual([
      "Incoming graduate students lease apartments months before arrival without seeing them.",
      "A recorded walkthrough from the departing student replaces the visit.",
    ]);
  });
  it("404s a card the token cannot see and 400s a malformed id", async () => {
    const missing = await readCard(req(`/api/lodestone/cards/${"e".repeat(32)}`), params("e".repeat(32)));
    expect(missing.status).toBe(404);
    const bad = await readCard(req("/api/lodestone/cards/nope"), params("nope"));
    expect(bad.status).toBe(400);
  });
  it("publishes and withdraws", async () => {
    const pub = await patchCard(req(`/api/lodestone/cards/${sam.ideaId}`, { method: "PATCH", body: JSON.stringify({ visibility: "cohort" }) }), params(sam.ideaId));
    expect(pub.status).toBe(200);
    expect((await pub.json()).card.visibility).toBe("cohort");
    const priv = await patchCard(req(`/api/lodestone/cards/${sam.ideaId}`, { method: "PATCH", body: JSON.stringify({ visibility: "private" }) }), params(sam.ideaId));
    expect((await priv.json()).card.visibility).toBe("private");
    const bad = await patchCard(req(`/api/lodestone/cards/${sam.ideaId}`, { method: "PATCH", body: JSON.stringify({ visibility: "everyone" }) }), params(sam.ideaId));
    expect(bad.status).toBe(400);
  });
  it("records a verdict and lists it", async () => {
    const res = await sendFeedback(
      req(`/api/lodestone/cards/${sam.ideaId}/feedback`, { method: "POST", body: JSON.stringify({ kind: "paper", targetId: "doc-9", verdict: "not_relevant", context: { score: 0.4 } }) }),
      params(sam.ideaId),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).feedback.verdict).toBe("not_relevant");
    const list = await (await readFeedback(req(`/api/lodestone/cards/${sam.ideaId}/feedback`), params(sam.ideaId))).json();
    expect(list.feedback).toHaveLength(1);
    const bad = await sendFeedback(
      req(`/api/lodestone/cards/${sam.ideaId}/feedback`, { method: "POST", body: JSON.stringify({ kind: "paper", targetId: "doc-9", verdict: "meh" }) }),
      params(sam.ideaId),
    );
    expect(bad.status).toBe(400);
  });
  it("serves one paper or patent to any token, with a citation line", async () => {
    const db = await getDb();
    const paperParams = (documentId: string) => ({ params: Promise.resolve({ documentId }) });
    const abstract = "Departing tenants who record a walkthrough video reduce mid-lease moves among arriving students.";
    const [paper] = await db.insert(document).values({ sessionId: null, source: "paper", title: "Walkthroughs and arrivals", text: null }).returning({ id: document.id });
    const put = await putArtifactText(db, {
      artifactId: paper.id,
      sourceFormat: "abstract",
      parser: "test",
      text: abstract,
      provenance: { doi: "10.5555/walk", openalex_id: "https://openalex.org/W42", authors: ["A. Reader", "B. Writer"], year: 2021, venue: "Housing Studies", query_set: "housing" },
    });
    const res = await readPaper(req(`/api/lodestone/papers/${paper.id}`), paperParams(paper.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      documentId: paper.id,
      kind: "paper",
      title: "Walkthroughs and arrivals",
      abstract,
      abstractHash: put.textHash,
      thin: false,
      abstractKind: "abstract",
      provenance: expect.objectContaining({ doi: "10.5555/walk", query_set: "housing" }),
      citation: "A. Reader, B. Writer. (2021). Walkthroughs and arrivals. Housing Studies",
    });

    // A thin document: its "abstract" is the Semantic Scholar TLDR, and the response says so.
    const tldr = "Walkthrough videos cut mid-lease moves.";
    const [thin] = await db.insert(document).values({ sessionId: null, source: "paper", title: "Summarised only", text: null }).returning({ id: document.id });
    const thinPut = await putArtifactText(db, { artifactId: thin.id, sourceFormat: "tldr", parser: "test", text: tldr, provenance: { doi: "10.5555/thin", thin: true, tldr, query_set: "card-search" } });
    const t = await (await readPaper(req(`/api/lodestone/papers/${thin.id}`), paperParams(thin.id))).json();
    expect(t).toMatchObject({ thin: true, abstractKind: "tldr", abstract: tldr, abstractHash: thinPut.textHash });

    const [patent] = await db.insert(document).values({ sessionId: null, source: "patent", title: "Escrowed sublet deposit", text: null }).returning({ id: document.id });
    await putArtifactText(db, {
      artifactId: patent.id,
      sourceFormat: "abstract",
      parser: "test",
      text: "A deposit is held in escrow.",
      provenance: { patent_number: "11000001", inventors: ["C. Inventor"], year: 2023 },
    });
    const p = await (await readPaper(req(`/api/lodestone/papers/${patent.id}`), paperParams(patent.id))).json();
    expect(p.kind).toBe("patent");
    expect(p.citation).toBe("C. Inventor. (2023). Escrowed sublet deposit. US Patent 11000001");

    expect((await readPaper(req(`/api/lodestone/papers/${paper.id}`, {}, ""), paperParams(paper.id))).status).toBe(401);
    expect((await readPaper(req(`/api/lodestone/papers/${sam.ideaId}`), paperParams(sam.ideaId))).status).toBe(404);
    const unknown = "00000000-0000-4000-8000-000000000000";
    expect((await readPaper(req(`/api/lodestone/papers/${unknown}`), paperParams(unknown))).status).toBe(404);
    // A corpus row whose canonical text never landed is a broken write, not a paper.
    const [halfway] = await db.insert(document).values({ sessionId: null, source: "paper", title: "half written", text: null }).returning({ id: document.id });
    expect((await readPaper(req(`/api/lodestone/papers/${halfway.id}`), paperParams(halfway.id))).status).toBe(404);
    const [deck] = await db.insert(document).values({ sessionId: null, source: "deck", title: "a deck", text: "slides" }).returning({ id: document.id });
    expect((await readPaper(req(`/api/lodestone/papers/${deck.id}`), paperParams(deck.id))).status).toBe(404);
  });
  it("diffs the owner's list against the last send once its search is done, never snapshotting on the first read", async () => {
    const db = await getDb();
    const snapshots = async (ideaId: string) => db.select().from(cardRank).where(eq(cardRank.ideaId, ideaId));
    const read = async (ideaId: string, auth = token) => (await readCard(req(`/api/lodestone/cards/${ideaId}`, {}, auth), params(ideaId))).json();
    const before = (await snapshots(sam.ideaId)).length;
    expect(before).toBeGreaterThan(0);
    const pivot = { ...sam, entries: sam.entries.map((e) => (e.block === "customer_segments" ? { ...e, text: "Visiting scholars on one-term appointments" } : e)) };
    expect((await sendCard(req("/api/lodestone/cards", { method: "POST", body: JSON.stringify(forgeDocument(pivot)) }))).status).toBe(200);
    const [{ importSeq }] = await db.select({ importSeq: forgeCard.importSeq }).from(forgeCard).where(eq(forgeCard.ideaId, sam.ideaId));

    // Its search queued, not run: no snapshot, and nothing to diff yet.
    const first = await read(sam.ideaId);
    expect(first.changes).toBeNull();
    expect(await snapshots(sam.ideaId)).toHaveLength(before);

    await searchCard(db, sam.ideaId, {
      searchWorks: async () => ({ seen: 0, stopped: false, cursor: null }),
      searchS2: async () => ({ hits: [], skippedNoDoi: 0 }),
      fetchWork: async () => null,
      embed: testEmbed,
      now: () => new Date(),
    });
    expect(await snapshots(sam.ideaId)).toHaveLength(before + 1);
    const after = await read(sam.ideaId);
    expect(after.changes).toMatchObject({ since: String(importSeq), blocks: ["customer_segments"] });
    expect(Array.isArray(after.changes.added)).toBe(true);
    expect(Array.isArray(after.changes.dropped)).toBe(true);
  });
  it("snapshots a card not sent since snapshots began on its first read, once over three, and shows no one else the diff", async () => {
    const db = await getDb();
    const priya = COHORT[1];
    const priyaId = await ensurePerson(db, { name: priya.name, email: priya.email });
    const priyaToken = (await mintToken(db, priyaId, "second client")).token;
    // As a card imported before `import_seq` existed reads.
    await db.update(forgeCard).set({ importSeq: 0 }).where(eq(forgeCard.ideaId, priya.ideaId));
    for (let i = 0; i < 3; i++) {
      const own = await (await readCard(req(`/api/lodestone/cards/${priya.ideaId}`, {}, priyaToken), params(priya.ideaId))).json();
      expect(own.changes).toBeNull();
    }
    const rows = await db.select().from(cardRank).where(eq(cardRank.ideaId, priya.ideaId));
    expect(rows.map((r) => r.importSeq)).toEqual([0]);
    // Sam reads Priya's published card: no diff, not even a null one.
    const seen = await (await readCard(req(`/api/lodestone/cards/${priya.ideaId}`), params(priya.ideaId))).json();
    expect(seen).not.toHaveProperty("changes");
  });
  it("reads back a card sent under Whetstone's own id, a dashed uuid", async () => {
    // Whetstone mints idea ids with crypto.randomUUID(); only a /1 document's
    // derived id is 32 bare hex. A card the send accepts must be one the
    // client can read, publish and vote on.
    const ideaId = "7214159e-ca24-4873-b571-34c14119b7f0";
    const sent = await sendCard(req("/api/lodestone/cards", { method: "POST", body: JSON.stringify({ ...forgeDocument(sam), id: ideaId }) }));
    expect(sent.status).toBe(201);
    expect((await sent.json()).card.ideaId).toBe(ideaId);
    expect((await readCard(req(`/api/lodestone/cards/${ideaId}`), params(ideaId))).status).toBe(200);
    const pub = await patchCard(req(`/api/lodestone/cards/${ideaId}`, { method: "PATCH", body: JSON.stringify({ visibility: "private" }) }), params(ideaId));
    expect(pub.status).toBe(200);
    const vote = await sendFeedback(
      req(`/api/lodestone/cards/${ideaId}/feedback`, { method: "POST", body: JSON.stringify({ kind: "paper", targetId: "doc-9", verdict: "useful" }) }),
      params(ideaId),
    );
    expect(vote.status).toBe(200);
    expect((await readFeedback(req(`/api/lodestone/cards/${ideaId}/feedback`), params(ideaId))).status).toBe(200);
  });
});

describe("paper search", () => {
  const SET = "search-route-test";
  const Q = "popularity bias recommendations";
  const search = (body: unknown, auth = token) =>
    searchPapersRoute(req("/api/lodestone/papers/search", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }, auth));
  const documents = async () => (await (await getDb()).select({ id: document.id }).from(document)).length;

  beforeAll(async () => {
    const db = await getDb();
    const add = async (title: string, abstract: string, provenance: Record<string, unknown>) => {
      const [row] = await db.insert(document).values({ sessionId: null, source: "paper", title, text: null }).returning({ id: document.id });
      await putArtifactText(db, { artifactId: row.id, sourceFormat: "abstract", parser: "test", text: abstract, provenance: { query_set: SET, ...provenance } });
    };
    await add("Near", `${Q} alpha beta gamma delta`, { rating_avg: 6.5, citations_per_year: 3, year: 2023 });
    await add("Nearer", `${Q} alpha beta`, { year: 2026 });
    await add("Cold start", "cold start items for new users", { year: 2024 });
    await embedPaperAbstracts(db, testEmbed);
  }, 60_000);

  it("answers 401 without a token, naming it", async () => {
    const res = await search({ q: Q }, "");
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/token/);
  });

  it("answers 400 on a body that is empty, not JSON, or out of range, naming the field", async () => {
    expect((await search("")).status).toBe(400);
    expect((await search("not json")).status).toBe(400);
    const five = await search({ q: ["a", "b", "c", "d", "e"] });
    expect(five.status).toBe(400);
    expect((await five.json()).error).toMatch(/^q/);
    for (const k of [0, 51]) {
      const res = await search({ q: Q, k });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/^k/);
    }
  });

  it("returns a set's hits nearest first, with absent metrics as null", async () => {
    const res = await search({ q: Q, k: 2, set: SET });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openalex).toBeNull();
    expect(body.hits.map((h: { title: string }) => h.title)).toEqual(["Nearer", "Near"]);
    expect(body.hits[0]).toMatchObject({ source: "corpus", query_set: SET, year: 2026, rating_avg: null, citations_per_year: null, link: null, abstract: `${Q} alpha beta` });
    expect(body.hits[1]).toMatchObject({ rating_avg: 6.5, citations_per_year: 3 });
    expect(body.hits[0].similarity).toBeGreaterThanOrEqual(body.hits[1].similarity);
  });

  it("gives every token the same hits: the corpus is shared", async () => {
    const db = await getDb();
    const other = await ensurePerson(db, { name: "Second Reader", email: "second.reader@lodestone.invalid" });
    const otherToken = (await mintToken(db, other, "test client")).token;
    const mine = await (await search({ q: Q, k: 3, set: SET })).json();
    const theirs = await (await search({ q: Q, k: 3, set: SET }, otherToken)).json();
    expect(theirs).toEqual(mine);
  });

  it("answers an unknown set with no hits, not 404", async () => {
    const res = await search({ q: Q, set: "no-such-set" });
    expect(res.status).toBe(200);
    expect((await res.json()).hits).toEqual([]);
  });

  it("merges sub-claims, each paper once at its best similarity", async () => {
    const one = await (await search({ q: Q, k: 3, set: SET })).json();
    const both = await (await search({ q: [Q, "cold start items"], k: 3, set: SET })).json();
    const ids = both.hits.map((h: { id: string }) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(3);
    const near = (hits: { title: string; similarity: number }[]) => hits.find((h) => h.title === "Nearer")!.similarity;
    expect(near(both.hits)).toBe(near(one.hits));
  });

  it("adds live OpenAlex hits when asked, spaced by one limiter, writing nothing", async () => {
    const starts: number[] = [];
    vi.stubGlobal("fetch", async () => {
      starts.push(Date.now());
      return new Response(JSON.stringify({ results: [{ id: "https://openalex.org/W77", title: "Live work", publication_year: 2025, abstract_inverted_index: { Live: [0] } }], meta: { next_cursor: null } }), { status: 200 });
    });
    try {
      const before = await documents();
      const res = await search({ q: [Q, "cold start items", "alpha"], k: 2, set: SET, openalex: true });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.openalex).toEqual({ stopped: [] });
      expect(body.hits.filter((h: { source: string }) => h.source === "openalex")).toEqual([
        expect.objectContaining({ id: "W77", source: "openalex", similarity: null, abstract: "Live" }),
      ]);
      expect(starts).toHaveLength(3);
      const sorted = [...starts].sort((a, b) => a - b);
      for (let at = 1; at < sorted.length; at += 1) expect(sorted[at] - sorted[at - 1]).toBeGreaterThanOrEqual(950);
      expect(await documents()).toBe(before);
    } finally {
      vi.unstubAllGlobals();
    }
  }, 15_000);

  it("lists each question OpenAlex stopped on", async () => {
    vi.stubGlobal("fetch", async () => new Response("down", { status: 503 }));
    try {
      const body = await (await search({ q: Q, k: 1, openalex: true })).json();
      expect(body.openalex.stopped).toEqual([expect.stringMatching(/openalex 503/)]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("answers 503 naming VOYAGE_API_KEY when nothing can embed, and 502 when the provider throws", async () => {
    try {
      embedding.mode = "keyless";
      const keyless = await search({ q: Q });
      expect(keyless.status).toBe(503);
      expect((await keyless.json()).error).toMatch(/VOYAGE_API_KEY/);
      embedding.mode = "throws";
      const fault = await search({ q: Q });
      expect(fault.status).toBe(502);
      expect((await fault.json()).error).toMatch(/voyage 500/);
    } finally {
      embedding.mode = "ok";
    }
  });
});
