import { beforeAll, describe, expect, it } from "vitest";
import { COHORT, forgeDocument } from "../../evals/lodestone/cohort";
import { createPgliteDb, type Db } from "@/db/client";
import { ensurePerson } from "@/harness/ledger";
import { enrollTestMember } from "@/pilot/test-fixtures";
import {
  TOKEN_PREFIX,
  cardSummary,
  feedbackCounts,
  feedbackFor,
  listTokens,
  mintToken,
  personForToken,
  personFromRequest,
  recordFeedback,
  revokeToken,
} from "./api";
import { importCard } from "./cards";
import { testEmbed } from "./test-embed";

let db: Db;
let sam: string;
let priya: string;
const samCard = COHORT[0];

beforeAll(async () => {
  db = await createPgliteDb();
  sam = await ensurePerson(db, { name: COHORT[0].name, email: COHORT[0].email });
  priya = await ensurePerson(db, { name: COHORT[1].name, email: COHORT[1].email });
  await enrollTestMember(db, sam);
  await enrollTestMember(db, priya);
  await importCard(db, { id: sam, email: COHORT[0].email }, forgeDocument(samCard), testEmbed);
}, 60_000);

describe("tokens", () => {
  it("mints a prefixed token, stores only its hash, and resolves it to the person", async () => {
    const { token, row } = await mintToken(db, sam, "laptop");
    expect(token.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(token.length).toBe(TOKEN_PREFIX.length + 64);
    expect(row.tokenHash).not.toContain(token.slice(4, 20));
    const who = await personForToken(db, token);
    expect(who?.id).toBe(sam);
    expect(who?.email).toBe(COHORT[0].email);
    const [stored] = await listTokens(db, sam);
    expect(stored.lastUsedAt).not.toBeNull();
  });
  it("reads the bearer header and rejects anything else", async () => {
    const { token } = await mintToken(db, sam, "desk");
    const ok = new Request("https://lodestone.invalid/api/lodestone/me", { headers: { authorization: `Bearer ${token}` } });
    expect((await personFromRequest(db, ok))?.id).toBe(sam);
    const wrong = new Request("https://lodestone.invalid/api/lodestone/me", { headers: { authorization: `Bearer ${TOKEN_PREFIX}${"0".repeat(64)}` } });
    expect(await personFromRequest(db, wrong)).toBeNull();
    const none = new Request("https://lodestone.invalid/api/lodestone/me");
    expect(await personFromRequest(db, none)).toBeNull();
    const basic = new Request("https://lodestone.invalid/api/lodestone/me", { headers: { authorization: `Basic ${token}` } });
    expect(await personFromRequest(db, basic)).toBeNull();
  });
  it("revokes for the owner only, after which the token resolves to nobody", async () => {
    const { token, row } = await mintToken(db, sam, "old phone");
    await expect(revokeToken(db, priya, row.id)).rejects.toThrow(/not found/i);
    const cut = await revokeToken(db, sam, row.id);
    expect(cut.revokedAt).not.toBeNull();
    expect(await personForToken(db, token)).toBeNull();
    await expect(revokeToken(db, sam, row.id)).rejects.toThrow(/not found/i);
  });
  it("refuses an empty label", async () => {
    await expect(mintToken(db, sam, "  ")).rejects.toThrow(/label/);
  });
});

describe("feedback", () => {
  it("records the owner's verdict once per target and replaces it on a second opinion", async () => {
    const first = await recordFeedback(db, sam, { ideaId: samCard.ideaId, kind: "paper", targetId: "doc-1", verdict: "useful", context: { score: 0.81 } });
    expect(first.verdict).toBe("useful");
    const second = await recordFeedback(db, sam, { ideaId: samCard.ideaId, kind: "paper", targetId: "doc-1", verdict: "known" });
    expect(second.id).toBe(first.id);
    expect(second.verdict).toBe("known");
    const mine = await feedbackFor(db, sam, samCard.ideaId);
    expect(mine).toHaveLength(1);
    expect(await feedbackCounts(db, "paper", "doc-1")).toEqual({ useful: 0, known: 1, not_relevant: 0 });
  });
  it("lets only the card's owner speak for it", async () => {
    await expect(recordFeedback(db, priya, { ideaId: samCard.ideaId, kind: "peer", targetId: "x", verdict: "useful" })).rejects.toThrow(/not found/i);
  });
  it("rejects unknown kinds and verdicts", async () => {
    await expect(recordFeedback(db, sam, { ideaId: samCard.ideaId, kind: "book" as never, targetId: "x", verdict: "useful" })).rejects.toThrow(/kind/);
    await expect(recordFeedback(db, sam, { ideaId: samCard.ideaId, kind: "paper", targetId: "x", verdict: "meh" as never })).rejects.toThrow(/verdict/);
  });
});

it("summarises a card without its document", async () => {
  const { importCard: _ } = await import("./cards");
  const { cardsForOwner } = await import("./cards");
  const [card] = await cardsForOwner(db, sam);
  const s = cardSummary(card);
  expect(s).toMatchObject({ ideaId: samCard.ideaId, title: "Sublet, sight seen", visibility: "private" });
  expect(s.confirmed).toBeGreaterThan(0);
  expect("doc" in s).toBe(false);
});
