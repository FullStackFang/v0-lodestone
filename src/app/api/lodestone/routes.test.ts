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
});
