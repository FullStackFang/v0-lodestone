/** The client routes end to end against the in-memory ledger: a token is
 *  minted, a card is sent, read back with its matches, published, and judged.
 *  The handlers run as functions; `getDb()` is the in-memory PGlite under
 *  vitest, so the routes share one database for the file. */
import { beforeAll, describe, expect, it } from "vitest";
import { COHORT, forgeDocument } from "../../../../evals/lodestone/cohort";
import { getDb } from "@/db/client";
import { ensurePerson } from "@/harness/ledger";
import { mintToken } from "@/lodestone/api";
import { enrollTestMember } from "@/pilot/test-fixtures";
import { GET as me } from "./me/route";
import { GET as listCards, POST as sendCard } from "./cards/route";
import { GET as readCard, PATCH as patchCard } from "./cards/[ideaId]/route";
import { GET as readFeedback, POST as sendFeedback } from "./cards/[ideaId]/feedback/route";
import { GET as readPaper } from "./papers/[documentId]/route";
import { document } from "@/db/schema";
import { putArtifactText } from "@/harness/canonical";

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
      provenance: expect.objectContaining({ doi: "10.5555/walk", query_set: "housing" }),
      citation: "A. Reader, B. Writer. (2021). Walkthroughs and arrivals. Housing Studies",
    });

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
