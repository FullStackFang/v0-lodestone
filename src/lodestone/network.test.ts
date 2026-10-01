/** The network end to end on an in-memory ledger: import, visibility, prior
 *  art at zero density, peers once a cohort exists, the map, the digest. The
 *  embedder is the hashed bag of words, so a match here means shared words. */
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { COHORT, CORPUS, forgeDocument } from "../../evals/lodestone/cohort";
import { createPgliteDb, type Db } from "@/db/client";
import { document, forgeCard, assertions } from "@/db/schema";
import { ensurePerson } from "@/harness/ledger";
import { enrollTestMember } from "@/pilot/test-fixtures";
import { canView, cardBlocks, cardsForOwner, cohortCards, cohortCounts, importCard, setVisibility } from "./cards";
import { digestFor, renderDigest } from "./digest";
import { cohortMap } from "./map";
import { peersFor } from "./peers";
import { corpusSize, embedPaperAbstracts, priorArtFor } from "./priorArt";
import { testEmbed } from "./test-embed";

let db: Db;
const people = new Map<string, string>();
const sam = COHORT[0];
const priya = COHORT[1];
const stranger = { name: "Not A Member", email: "outsider@cohort.test" };

beforeAll(async () => {
  db = await createPgliteDb();
  for (const m of COHORT) {
    const id = await ensurePerson(db, { name: m.name, email: m.email });
    people.set(m.email, id);
    await enrollTestMember(db, id);
  }
  people.set(stranger.email, await ensurePerson(db, stranger));
  for (const p of CORPUS) {
    await db.insert(document).values({ sessionId: null, source: "paper", title: p.title, text: p.abstract });
  }
}, 60_000);

const owner = (email: string) => ({ id: people.get(email)!, email });

describe("import", () => {
  it("files the ledger rows under the owner, keeps the document, and embeds", async () => {
    const out = await importCard(db, owner(sam.email), forgeDocument(sam), testEmbed);
    expect(out.created).toBe(true);
    expect(out.card.visibility).toBe("private");
    expect(out.card.title).toBe("Sublet, sight seen");
    expect(out.report.written).toBeGreaterThan(0);
    // Two `open` entries have no vector; the confirmed and drafted ones do.
    expect(out.embedded).toBe(out.report.written - 2);
    const { blocks, confirmed } = cardBlocks(out.card.doc);
    expect(blocks).toHaveLength(9);
    expect(blocks.find((b) => b.key === "revenue_streams")?.entries[0].origin).toBe("open");
    expect(confirmed).toBe(5);
  });

  it("re-imports without duplicating and refuses another member's idea id", async () => {
    const again = await importCard(db, owner(sam.email), forgeDocument(sam), testEmbed);
    expect(again.created).toBe(false);
    expect(again.report.written).toBe(0);
    expect(again.embedded).toBe(0);
    await expect(importCard(db, owner(priya.email), forgeDocument(sam), testEmbed)).rejects.toThrow(/another member/);
    expect(await cardsForOwner(db, people.get(sam.email)!)).toHaveLength(1);
  });
});

describe("prior art at zero density", () => {
  it("matches a private card against the corpus and names the block", async () => {
    expect(await corpusSize(db)).toBe(0);
    expect(await embedPaperAbstracts(db, testEmbed)).toBe(CORPUS.length);
    expect(await embedPaperAbstracts(db, testEmbed)).toBe(0);
    expect(await cohortCards(db)).toHaveLength(0);
    const hits = await priorArtFor(db, sam.ideaId, 3);
    expect(hits).toHaveLength(3);
    expect(hits[0].title).toBe("Sight-unseen leasing and the arriving-student housing gap");
    expect(hits[0].score).toBeGreaterThan(hits[2].score);
    expect(hits[0].blocks.length).toBeGreaterThan(0);
    expect(hits[0].blocks[0]).toMatch(/Customer segments|Value proposition|Key activities/);
  });
});

describe("visibility", () => {
  it("is private to everyone but the owner until published, then cohort-wide, then private again", async () => {
    const card = (await cardsForOwner(db, people.get(sam.email)!))[0];
    expect(await canView(db, people.get(priya.email)!, card)).toBe(false);
    const published = await setVisibility(db, people.get(sam.email)!, sam.ideaId, "cohort");
    expect(published.publishedAt).not.toBeNull();
    expect(await canView(db, people.get(priya.email)!, published)).toBe(true);
    expect(await canView(db, people.get(stranger.email)!, published)).toBe(false);
    expect(await cohortCards(db)).toHaveLength(1);
    const withdrawn = await setVisibility(db, people.get(sam.email)!, sam.ideaId, "private");
    expect(withdrawn.publishedAt).toBeNull();
    expect(await cohortCards(db)).toHaveLength(0);
    await expect(setVisibility(db, people.get(priya.email)!, sam.ideaId, "cohort")).rejects.toThrow(/not found/);
    await expect(setVisibility(db, people.get(stranger.email)!, sam.ideaId, "cohort")).rejects.toThrow(/not found/);
  });

  it("refuses cohort visibility to a non-member", async () => {
    const out = await importCard(db, owner(stranger.email), forgeDocument({ ...priya, ideaId: "f".repeat(32), email: stranger.email }), testEmbed);
    expect(out.card.visibility).toBe("private");
    await expect(setVisibility(db, people.get(stranger.email)!, "f".repeat(32), "cohort")).rejects.toThrow(/membership/);
  });
});

describe("the cohort", () => {
  beforeAll(async () => {
    for (const m of COHORT) {
      await importCard(db, owner(m.email), forgeDocument(m), testEmbed);
      await setVisibility(db, people.get(m.email)!, m.ideaId, "cohort");
    }
  }, 60_000);

  it("counts members, members working, and cards published", async () => {
    const counts = await cohortCounts(db);
    expect(counts.members).toBe(COHORT.length);
    expect(counts.working).toBe(COHORT.length);
    expect(counts.published).toBe(COHORT.length);
  });

  it("finds the housing peers for the sublet card and explains them by block", async () => {
    const peers = await peersFor(db, sam.ideaId, 3);
    expect(peers).toHaveLength(3);
    expect(peers.map((p) => p.owner.id)).not.toContain(people.get(sam.email));
    const titles = peers.map((p) => p.title);
    expect(titles).toContain("Move-out market");
    expect(titles).toContain("Arrival concierge");
    expect(peers[0].score).toBeGreaterThanOrEqual(peers[2].score);
    for (const p of peers) for (const s of p.shared) expect(s.similarity).toBeGreaterThanOrEqual(0.75);
  });

  // The hashed bag of words scores a ten-word block against a sixty-word
  // abstract far below the Voyage-tuned thresholds, so the paper thresholds
  // are lowered here; what is under test is the mechanism, not the constant.
  it("draws the map: regions named from the cards, a full profile, papers touched", async () => {
    const strict = await cohortMap(db);
    expect(strict.close).toBe(0.75);
    const map = await cohortMap(db, { close: 0.2 });
    expect(map.counts.placed).toBe(COHORT.length);
    expect(map.counts.unplaced).toBe(0);
    expect(map.regions.reduce((n, r) => n + r.cards.length, 0)).toBe(COHORT.length);
    expect(map.regions.length).toBeGreaterThanOrEqual(2);
    expect(map.profile.pairs).toBe((COHORT.length * (COHORT.length - 1)) / 2);
    for (const r of map.regions) expect(r.label).not.toBe("");
    const housing = map.regions.find((r) => r.cards.some((c) => c.title === "Sublet, sight seen"));
    expect(housing?.cards.map((c) => c.title)).toContain("Move-out market");
    expect(map.papersTouched).toBeGreaterThan(0);
  });

  it("builds a digest of what arrived since a date, and nothing before it", async () => {
    const me = people.get(sam.email)!;
    const before = await digestFor(db, me, new Date("2030-01-01T00:00:00Z"));
    expect(before.newCards).toBe(0);
    expect(before.sections[0].peers).toHaveLength(0);
    expect(before.sections[0].papers).toHaveLength(0);

    const since = new Date("2020-01-01T00:00:00Z");
    const digest = await digestFor(db, me, since, new Date(), { paperFloor: 0.2 });
    expect(digest.newCards).toBe(COHORT.length - 1);
    const section = digest.sections.find((s) => s.ideaId === sam.ideaId)!;
    expect(section.peers.length).toBeGreaterThan(0);
    expect(section.peers.map((p) => p.owner.id)).not.toContain(me);
    expect(section.papers.length).toBeGreaterThan(0);
    const text = renderDigest(digest, "http://localhost:3000");
    expect(text).toContain("Lodestone digest");
    expect(text).toContain("new card ·");
    expect(text).toContain("corpus ·");
  });

  it("drops a revoked member's card from every cohort list without touching the ledger", async () => {
    const jonas = COHORT[7];
    const [row] = await db.select().from(forgeCard).where(eq(forgeCard.ideaId, jonas.ideaId));
    expect(row.visibility).toBe("cohort");
    const rowsBefore = (await db.select().from(assertions).where(eq(assertions.subjectId, `forge:${jonas.ideaId}`))).length;
    const { pilotMembership } = await import("@/db/pilot-schema");
    await db.update(pilotMembership).set({ status: "revoked", revokedAt: new Date() }).where(eq(pilotMembership.personId, people.get(jonas.email)!));
    expect((await cohortCards(db)).map((c) => c.card.ideaId)).not.toContain(jonas.ideaId);
    expect((await peersFor(db, sam.ideaId, 10)).map((p) => p.ideaId)).not.toContain(jonas.ideaId);
    const rowsAfter = (await db.select().from(assertions).where(eq(assertions.subjectId, `forge:${jonas.ideaId}`))).length;
    expect(rowsAfter).toBe(rowsBefore);
  });
});
