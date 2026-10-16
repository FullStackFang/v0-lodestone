/** The network end to end on an in-memory ledger: import, visibility, prior
 *  art at zero density, peers once a cohort exists, the map, the digest. The
 *  embedder is the hashed bag of words, so a match here means shared words. */
import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COHORT, CORPUS, forgeDocument } from "../../evals/lodestone/cohort";
import { createPgliteDb, type Db } from "@/db/client";
import { artifactTexts, cardFeedback, document, documentChunk, forgeCard, assertions } from "@/db/schema";
import { putArtifactText } from "@/harness/canonical";
import { ensurePerson } from "@/harness/ledger";
import { enrollTestMember } from "@/pilot/test-fixtures";
import { blockLabel, canView, cardBlocks, cardsForOwner, cohortCards, cohortCounts, importCard, setVisibility } from "./cards";
import { digestFor, renderDigest } from "./digest";
import { cohortMap, corpusSummary } from "./map";
import { peersFor } from "./peers";
import { recordFeedback } from "./api";
import { NEAR_USEFUL, USEFUL_BOOST, applyVerdicts, corpusSize, embedPaperAbstracts, fieldQuota, heldPapers, priorArtFor, scorePaper, type CorpusKind } from "./priorArt";
import { testEmbed, testVector } from "./test-embed";
import { cosine, ideaVectors } from "./vectors";

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
  for (const p of CORPUS) await addPaper(p.title, p.abstract);
}, 60_000);

/** A corpus paper as every writer stores one: the abstract in
 *  `artifact_texts` only. */
async function addPaper(title: string, abstract: string, provenance: Record<string, unknown> = {}, source: "paper" | "patent" = "paper") {
  const [row] = await db.insert(document).values({ sessionId: null, source, title, text: null }).returning();
  await putArtifactText(db, { artifactId: row.id, sourceFormat: "abstract", parser: "test", text: abstract, provenance });
  return row;
}

/** Every corpus vector read back and scored in Node: what `priorArtFor`
 *  did before ranking moved into the database, newest first so a tie breaks
 *  the same way. With `ownerId`, that person's verdicts on the card applied
 *  by `applyVerdicts`, every corpus document a neighbour candidate. */
async function exactScan(ideaId: string, k: number, since?: Date, options: { ownerId?: string; perField?: number } = {}) {
  const rows = (await ideaVectors(db, [ideaId])).get(ideaId) ?? [];
  const [card] = await db.select({ doc: forgeCard.doc }).from(forgeCard).where(eq(forgeCard.ideaId, ideaId));
  const corpus = await db
    .select({ documentId: document.id, kind: document.source, title: document.title, embedding: documentChunk.embedding, provenance: artifactTexts.provenance, addedAt: document.createdAt })
    .from(documentChunk)
    .innerJoin(document, eq(document.id, documentChunk.documentId))
    .leftJoin(artifactTexts, eq(artifactTexts.artifactId, document.id))
    .where(and(inArray(document.source, ["paper", "patent"]), isNotNull(documentChunk.embedding), since ? gte(document.createdAt, since) : undefined))
    .orderBy(desc(document.createdAt));
  const scored = corpus
    .map((p) => scorePaper(rows, { ...p, kind: p.kind as CorpusKind, embedding: p.embedding as number[] }, heldPapers(card.doc)))
    .sort((a, b) => b.score - a.score);
  if (!options.ownerId) return fieldQuota(scored, k, options.perField);
  const verdicts = await db
    .select({ documentId: cardFeedback.targetId, verdict: cardFeedback.verdict })
    .from(cardFeedback)
    .where(and(eq(cardFeedback.personId, options.ownerId), eq(cardFeedback.ideaId, ideaId), eq(cardFeedback.kind, "paper")));
  // The useful documents come from the whole corpus, not the `since` window.
  const usefulIds = verdicts.filter((v) => v.verdict === "useful").map((v) => v.documentId);
  const useful = usefulIds.length
    ? await db.select({ documentId: documentChunk.documentId, embedding: documentChunk.embedding }).from(documentChunk).where(inArray(documentChunk.documentId, usefulIds))
    : [];
  const neighbours = corpus.flatMap((p) =>
    useful.filter((u) => u.documentId !== p.documentId).map((u) => ({ documentId: p.documentId, via: u.documentId, near: cosine(p.embedding as number[], u.embedding as number[]) })),
  );
  return fieldQuota(applyVerdicts(scored, verdicts, neighbours), k, options.perField);
}

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
    // Embedded from the canonical text, and the abstract copied nowhere.
    const stored = await db.select({ doc: document.text, chunk: documentChunk.text }).from(documentChunk).innerJoin(document, eq(document.id, documentChunk.documentId));
    expect(stored).toHaveLength(CORPUS.length);
    expect(stored.every((s) => s.doc === null && s.chunk === null)).toBe(true);
    expect(await cohortCards(db)).toHaveLength(0);
    const hits = await priorArtFor(db, sam.ideaId, 3);
    expect(hits).toHaveLength(3);
    expect(hits[0].title).toBe("Sight-unseen leasing and the arriving-student housing gap");
    expect(hits[0].score).toBeGreaterThan(hits[2].score);
    expect(hits[0].blocks.length).toBeGreaterThan(0);
    expect(hits[0].blocks[0]).toMatch(/Customer segments|Value proposition|Key activities/);
    expect(hits.every((h) => h.yours === false)).toBe(true);
  });

  it("flags the paper the author already holds, by DOI, and only that one", async () => {
    const [held] = await db.select({ id: document.id }).from(document).where(eq(document.title, CORPUS[0].title));
    await db.update(artifactTexts).set({ provenance: { doi: "10.1000/SIGHT-unseen", openalex_id: null } }).where(eq(artifactTexts.artifactId, held.id));
    const v3 = {
      ...forgeDocument(sam),
      format: "forge-idea/3",
      already_have: [{ id: "W1", title: CORPUS[0].title, doi: "https://doi.org/10.1000/sight-unseen" }],
    };
    const out = await importCard(db, owner(sam.email), v3, testEmbed);
    expect(out.created).toBe(false);
    const hits = await priorArtFor(db, sam.ideaId, CORPUS.length);
    expect(hits.find((h) => h.title === CORPUS[0].title)?.yours).toBe(true);
    expect(hits.filter((h) => h.yours)).toHaveLength(1);
    // Back on /2 the same card holds nothing.
    await importCard(db, owner(sam.email), forgeDocument(sam), testEmbed);
    expect((await priorArtFor(db, sam.ideaId, CORPUS.length)).some((h) => h.yours)).toBe(false);
  });

  it("imports forge-idea/4 as /3, the support beside each workspace ignored", async () => {
    const doc = forgeDocument(sam) as { workspaces: Record<string, unknown>[] };
    const v4 = {
      ...doc,
      format: "forge-idea/4",
      already_have: [],
      workspaces: doc.workspaces.map((w) => ({
        ...w,
        support: [
          { block: "cost_structure", entry_key: null, document_id: "d1", kind: "paper", title: "T",
            citation: "A (2021). T.", sentence: "Margins fall.", stance: "contradicts", run_id: "r1" },
        ],
      })),
    };
    const out = await importCard(db, owner(sam.email), v4, testEmbed);
    expect(out.created).toBe(false);
    const blocks = cardBlocks(v4).blocks.flatMap((b) => b.entries.map((e) => e.text));
    expect(blocks).not.toContain("Margins fall.");
    await importCard(db, owner(sam.email), forgeDocument(sam), testEmbed);
  });

  it("embeds a patent like a paper and ranks it in the same list, saying what it is", async () => {
    const abstract =
      "A system verifies a sublet from a departing student to an arriving student, records a walkthrough video of the unit, and holds the deposit in escrow until move-in under a semester-length lease.";
    const patent = await addPaper(
      "Verified student sublet with walkthrough video",
      abstract,
      { patent_number: "11999999", url: "https://patents.google.com/patent/US11999999", year: 2024, field: "G — Physics", query_set: "housing-patents" },
      "patent",
    );
    expect(await embedPaperAbstracts(db, testEmbed)).toBe(1);
    const hits = await priorArtFor(db, sam.ideaId, 3);
    expect(hits[0]).toMatchObject({
      documentId: patent.id,
      kind: "patent",
      querySet: "housing-patents",
      url: "https://patents.google.com/patent/US11999999",
      year: 2024,
    });
    expect(hits.slice(1).every((h) => h.kind === "paper" && h.querySet === null)).toBe(true);
    expect(await corpusSize(db)).toBe(CORPUS.length + 1);
  });

  it("embeds a batch at a time, so a run that dies keeps what it finished", async () => {
    const texts = ["first unembedded abstract", "second unembedded abstract", "third unembedded abstract"];
    const size = await corpusSize(db);
    for (const text of texts) await addPaper(text, text);
    // Counted once it has a vector, not before.
    expect(await corpusSize(db)).toBe(size);
    let calls = 0;
    const dying = async (batch: string[]) => {
      if (++calls === 2) throw new Error("killed");
      return testEmbed(batch);
    };
    await expect(embedPaperAbstracts(db, dying, 2)).rejects.toThrow(/killed/);
    expect(await corpusSize(db)).toBe(size + 2);
    expect(await embedPaperAbstracts(db, testEmbed, 2)).toBe(1);
    expect(await embedPaperAbstracts(db, testEmbed)).toBe(0);
    expect(await corpusSize(db)).toBe(size + 3);
  });

  it("leaves a corpus row with no canonical text unembedded: there is nothing to embed", async () => {
    await db.insert(document).values({ sessionId: null, source: "paper", title: "half written", text: null });
    expect(await embedPaperAbstracts(db, testEmbed)).toBe(0);
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

  it("ranks prior art in the database exactly as a scan of every vector would", async () => {
    const [{ mid }] = await db.select({ mid: document.createdAt }).from(document).where(eq(document.title, CORPUS[2].title));
    for (const m of COHORT) {
      for (const since of [undefined, mid]) {
        const want = await exactScan(m.ideaId, 3, since);
        const got = await priorArtFor(db, m.ideaId, 3, { since });
        expect(got.map((h) => h.documentId)).toEqual(want.map((h) => h.documentId));
        for (const [at, h] of got.entries()) {
          expect(h.score).toBeCloseTo(want[at].score, 5);
          expect(h.blocks).toEqual(want[at].blocks);
          expect(h.blockKeys).toEqual(want[at].blockKeys);
          expect(h.blockKeys.map(blockLabel)).toEqual(h.blocks);
          expect(h.yours).toBe(want[at].yours);
        }
        if (since) expect(got.every((h) => h.addedAt >= since)).toBe(true);
      }
    }
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
    const digest = await digestFor(db, me, since, new Date(), { paperFloor: 0.2, embed: testEmbed });
    expect(digest.newCards).toBe(COHORT.length - 1);
    const section = digest.sections.find((s) => s.ideaId === sam.ideaId)!;
    expect(section.peers.length).toBeGreaterThan(0);
    expect(section.peers.map((p) => p.owner.id)).not.toContain(me);
    expect(section.papers.length).toBeGreaterThan(0);
    for (const p of section.papers) {
      expect(p.sentences.length).toBeGreaterThan(0);
      expect(p.sentences.every((s) => s.block === p.blockKeys[0])).toBe(true);
    }
    const text = renderDigest(digest, "http://localhost:3000");
    expect(text).toContain("Lodestone digest");
    expect(text).toContain("new card ·");
    expect(text).toContain("corpus ·");
    expect(text).toContain("corpus · Patent · Verified student sublet with walkthrough video");
  });

  it("leaves a searched-in paper out of the digest window but ranks it on the card", async () => {
    const me = people.get(sam.email)!;
    const since = new Date(Date.now() - 1000);
    const text = `${sam.line} ${sam.said.join(" ")}`;
    const searched = await addPaper("Searched in for one card", text, { query_set: "card-search" });
    await embedPaperAbstracts(db, testEmbed);
    expect((await priorArtFor(db, sam.ideaId, 10)).map((h) => h.documentId)).toContain(searched.id);
    const digest = await digestFor(db, me, since, new Date(), { paperFloor: 0 });
    const section = digest.sections.find((s) => s.ideaId === sam.ideaId)!;
    expect(section.papers.map((p) => p.documentId)).not.toContain(searched.id);
    // Gone again, so the corpus counts below see only the seeded sets.
    await db.delete(documentChunk).where(eq(documentChunk.documentId, searched.id));
    await db.delete(artifactTexts).where(eq(artifactTexts.artifactId, searched.id));
    await db.delete(document).where(eq(document.id, searched.id));
  });

  it("holds at most three hits per field when one field dominates", async () => {
    const text = `${sam.line} ${sam.said.join(" ")}`;
    const crowd = [];
    for (let i = 0; i < 6; i++) crowd.push(await addPaper(`Crowd ${i}`, `${text} Variant ${i}.`, { field: "Crowding Studies" }));
    await embedPaperAbstracts(db, testEmbed);
    const off = await priorArtFor(db, sam.ideaId, 10, { perField: Infinity });
    expect(off.filter((h) => h.field === "Crowding Studies").length).toBeGreaterThan(3);
    const hits = await priorArtFor(db, sam.ideaId, 10);
    expect(hits.filter((h) => h.field === "Crowding Studies")).toHaveLength(3);
    expect(hits.map((h) => h.documentId)).toEqual((await exactScan(sam.ideaId, 10)).map((h) => h.documentId));
    for (const p of crowd) {
      await db.delete(documentChunk).where(eq(documentChunk.documentId, p.id));
      await db.delete(artifactTexts).where(eq(artifactTexts.artifactId, p.id));
      await db.delete(document).where(eq(document.id, p.id));
    }
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

describe("verdicts in the owner's list", () => {
  const all = { perField: Infinity };
  const samId = () => people.get(sam.email)!;
  const priyaId = () => people.get(priya.email)!;
  const ids = (hits: { documentId: string }[]) => hits.map((h) => h.documentId);
  const mark = (targetId: string, verdict: "useful" | "known" | "not_relevant", kind: "paper" | "peer" = "paper") =>
    recordFeedback(db, samId(), { ideaId: sam.ideaId, kind, targetId, verdict });
  const added: string[] = [];

  afterAll(async () => {
    await db.delete(cardFeedback).where(eq(cardFeedback.ideaId, sam.ideaId));
    for (const id of added) {
      await db.delete(documentChunk).where(eq(documentChunk.documentId, id));
      await db.delete(artifactTexts).where(eq(artifactTexts.artifactId, id));
      await db.delete(document).where(eq(document.id, id));
    }
  });

  it("drops a not_relevant document from the owner's list alone, beside a peer verdict", async () => {
    // A peer verdict's target is an idea id, not a uuid: the statement must
    // not cast it.
    await mark(priya.ideaId, "useful", "peer");
    const plain = await priorArtFor(db, sam.ideaId, 5, all);
    expect(ids(await priorArtFor(db, sam.ideaId, 5, { ...all, viewerId: samId() }))).toEqual(ids(plain));
    const dropped = plain[1].documentId;
    await mark(dropped, "not_relevant");
    await mark(plain[2].documentId, "known");
    const mine = await priorArtFor(db, sam.ideaId, 5, { ...all, viewerId: samId() });
    expect(mine).toHaveLength(5);
    expect(ids(mine)).not.toContain(dropped);
    expect(ids(mine)).toContain(plain[2].documentId);
    const theirs = await priorArtFor(db, sam.ideaId, 5, { ...all, viewerId: priyaId() });
    expect(ids(theirs)).toEqual(ids(plain));
  });

  it("pulls in a neighbour of a useful document by the boost, its score still its own cosine", async () => {
    const owner = { ...all, viewerId: samId() };
    const [top, rival] = await priorArtFor(db, sam.ideaId, 2, owner);
    const [{ text }] = await db.select({ text: artifactTexts.canonicalText }).from(artifactTexts).where(eq(artifactTexts.artifactId, top.documentId)).orderBy(desc(artifactTexts.version)).limit(1);
    // The top abstract diluted with words of no card's, twice: once to sit
    // just above `rival`, and once more to sit just below it, close to the
    // first. Scored here as the database will, from the same embedder.
    const rows = (await ideaVectors(db, [sam.ideaId])).get(sam.ideaId)!;
    const scoreOf = (t: string) => Math.max(...rows.map((r) => cosine(r.embedding, testVector(t))));
    const diluted = (n: number) => `${text} ${Array.from({ length: n }, (_, i) => `zq${i}x`).join(" ")}`;
    let n = 0;
    while (scoreOf(diluted(n)) > rival.score + 0.01) n++;
    const usefulText = diluted(n);
    while (scoreOf(diluted(n)) > rival.score - 0.01) n++;
    const nearText = diluted(n);
    expect(cosine(testVector(nearText), testVector(usefulText))).toBeGreaterThanOrEqual(NEAR_USEFUL);
    const useful = (await addPaper("The useful one", usefulText)).id;
    const near = (await addPaper("Near the useful one", nearText)).id;
    added.push(useful, near);
    await embedPaperAbstracts(db, testEmbed);

    // top, useful, rival in a list of three; the neighbour fourth, within
    // the boost of the third.
    const plain = await priorArtFor(db, sam.ideaId, 4, owner);
    expect(ids(plain)).toEqual([top.documentId, useful, rival.documentId, near]);
    expect(plain[2].score - plain[3].score).toBeLessThan(USEFUL_BOOST);
    expect(plain.every((h) => h.via === undefined)).toBe(true);

    await mark(useful, "useful");
    const mine = await priorArtFor(db, sam.ideaId, 3, owner);
    expect(ids(mine)).not.toContain(rival.documentId);
    const hit = mine.find((h) => h.documentId === near);
    expect(hit?.via).toEqual({ useful });
    expect(hit?.score).toBeCloseTo(plain[3].score, 6);
    expect(mine.filter((h) => h.via)).toHaveLength(1);
    const theirs = await priorArtFor(db, sam.ideaId, 3, { ...all, viewerId: priyaId() });
    // The plain ranking: no neighbour, and the document the owner excluded.
    expect(ids(theirs)).toEqual(ids(await priorArtFor(db, sam.ideaId, 3, all)));
    expect(ids(theirs)).not.toContain(near);
    expect(theirs.every((h) => h.via === undefined)).toBe(true);
  });

  it("ranks with verdicts exactly as a scan of every vector would, and without them for anyone else", async () => {
    const [{ mid }] = await db.select({ mid: document.createdAt }).from(document).where(eq(document.title, CORPUS[2].title));
    let via = 0;
    for (const since of [undefined, mid]) {
      for (const perField of [undefined, Infinity]) {
        for (const k of [3, 10]) {
          const want = await exactScan(sam.ideaId, k, since, { ownerId: samId(), perField });
          const got = await priorArtFor(db, sam.ideaId, k, { since, viewerId: samId(), perField });
          expect(ids(got)).toEqual(ids(want));
          for (const [at, h] of got.entries()) {
            expect(h.score).toBeCloseTo(want[at].score, 5);
            expect(h.via).toEqual(want[at].via);
          }
          via += got.filter((h) => h.via).length;
          const theirs = await priorArtFor(db, sam.ideaId, k, { since, viewerId: priyaId(), perField });
          expect(ids(theirs)).toEqual(ids(await exactScan(sam.ideaId, k, since, { perField })));
        }
      }
    }
    expect(via).toBeGreaterThan(0);
  });
});

describe("the corpus on the map", () => {
  it("counts each source, names each query set, and dates the newest arrival", async () => {
    const before = await corpusSummary(db);
    expect(before.bySource.patent).toBe(1);
    expect(before.querySets).toEqual([{ name: "housing-patents", kind: "patent", count: 1 }]);

    const abstract = "Escrowed deposits and verified handoffs in student housing markets.";
    const paper = await addPaper("Escrow in housing", abstract, { openalex_id: "https://openalex.org/W77", query_set: "housing-papers" });

    const after = await corpusSummary(db);
    expect(after.bySource).toEqual({ paper: before.bySource.paper + 1, patent: 1 });
    expect(after.querySets.map((s) => `${s.kind}:${s.name}:${s.count}`).sort()).toEqual(["paper:housing-papers:1", "patent:housing-patents:1"]);
    expect(after.newest?.getTime()).toBe(paper.createdAt.getTime());
  });
});
