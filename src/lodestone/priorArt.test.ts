/** Prior art for many cards in one statement is prior art for each card,
 *  hit for hit and in the same order. The corpus is written in two bulk
 *  inserts, so documents share a `created_at` and the order's last key, the
 *  document id, is what decides a tie at k. */
import { beforeAll, describe, expect, it } from "vitest";
import { COHORT, CORPUS, forgeDocument } from "../../evals/lodestone/cohort";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { artifactTexts, document, documentChunk } from "@/db/schema";
import { putArtifactText } from "@/harness/canonical";
import { ensurePerson } from "@/harness/ledger";
import { enrollTestMember } from "@/pilot/test-fixtures";
import { importCard } from "./cards";
import { THIN_FACTOR, applyVerdicts, embedPaperAbstracts, fieldQuota, priorArtFor, priorArtForMany, scorePaper, type CorpusKind } from "./priorArt";
import { countingDb } from "./test-db";
import { testEmbed } from "./test-embed";
import { ideaVectors } from "./vectors";

let db: Db;
let statements: string[];
let since: Date;
const UNEMBEDDED = "e".repeat(32);
const ids = [...COHORT.map((m) => m.ideaId), UNEMBEDDED];

/** One statement per batch, so every row in it shares `now()`. */
async function addBatch(papers: { title: string; abstract: string }[]) {
  const rows = await db.insert(document).values(papers.map((p) => ({ sessionId: null, source: "paper" as const, title: p.title, text: null }))).returning();
  for (const [at, row] of rows.entries()) {
    await putArtifactText(db, { artifactId: row.id, sourceFormat: "abstract", parser: "test", text: papers[at].abstract, provenance: {} });
  }
  return rows[0].createdAt;
}

beforeAll(async () => {
  ({ db, statements } = await countingDb());
  for (const m of COHORT) {
    const id = await ensurePerson(db, { name: m.name, email: m.email });
    await enrollTestMember(db, id);
    await importCard(db, { id, email: m.email }, forgeDocument(m), testEmbed);
  }
  // A card filed while no embedder was configured: no rows carry a vector.
  const owner = await ensurePerson(db, { name: COHORT[0].name, email: COHORT[0].email });
  await importCard(db, { id: owner, email: COHORT[0].email }, forgeDocument({ ...COHORT[1], ideaId: UNEMBEDDED }),
    async (texts) => ({ vectors: texts.map(() => null), embedded: false, model: null, tokens: null }));
  await addBatch(CORPUS.slice(0, 3));
  // The same words under another title (a different text hash, the same
  // bag-of-words vector): the same cosine to every card,
  // the same created_at, so only the id orders them.
  since = await addBatch([...CORPUS.slice(3), { title: `${CORPUS[3].title} (copy)`, abstract: `${CORPUS[3].abstract} ok.` }]);
  await embedPaperAbstracts(db, testEmbed);
}, 120_000);

describe("priorArtForMany", () => {
  for (const label of ["without since", "with since"]) {
    it(`gives every card exactly what priorArtFor gives it, ${label}`, async () => {
      const at = label === "with since" ? since : undefined;
      for (const k of [2, 3, CORPUS.length + 1]) {
        const many = await priorArtForMany(db, ids, k, { since: at });
        expect([...many.keys()].sort()).toEqual([...ids].sort());
        for (const id of ids) expect(many.get(id)).toEqual(await priorArtFor(db, id, k, { since: at }));
      }
    });
  }

  it("maps a card without vectors to an empty list and still ranks the rest", async () => {
    const many = await priorArtForMany(db, ids, 3);
    expect(many.get(UNEMBEDDED)).toEqual([]);
    expect(many.get(COHORT[0].ideaId)!.length).toBe(3);
    expect(await priorArtForMany(db, [UNEMBEDDED], 3)).toEqual(new Map([[UNEMBEDDED, []]]));
    expect(await priorArtForMany(db, [], 3)).toEqual(new Map());
  });

  it("breaks a tie on score and created_at by document id", async () => {
    // The quota off: both copies share a field, and the cut is the point.
    const hits = (await priorArtFor(db, COHORT[0].ideaId, CORPUS.length + 1, { perField: Infinity })).filter((h) => h.title.startsWith(CORPUS[3].title));
    expect(hits).toHaveLength(2);
    expect(hits[0].score).toBe(hits[1].score);
    expect(hits[0].documentId < hits[1].documentId).toBe(true);
  });

  it("reads vectors, cards, rankings and metadata once each, however many cards", async () => {
    for (const at of [undefined, since]) {
      const from = statements.length;
      await priorArtForMany(db, ids, 3, { since: at });
      expect(statements.slice(from)).toHaveLength(4);
    }
  });
});

describe("THIN_FACTOR", () => {
  // Thirty-one words that hash to distinct dimensions of the bag-of-words
  // embedder, so a document sharing n of the card's 25 scores exactly n/25.
  const WORDS = "alpha beta gamma delta epsilon zeta theta iota kappa lambda omicron sigma upsilon omega basalt granite marble slate shale pumice obsidian flint chalk gneiss schist jasper agate opal topaz garnet beryl".split(" ");
  const entry = WORDS.slice(0, 25).join(" ");
  const thinText = [...WORDS.slice(0, 20), ...WORDS.slice(25, 30)].join(" ");
  const fullText = [...WORDS.slice(0, 19), ...WORDS.slice(25, 31)].join(" ");
  const ideaId = "b".repeat(32);
  let thinId = "";
  let fullId = "";

  beforeAll(async () => {
    const owner = await ensurePerson(db, { name: COHORT[0].name, email: COHORT[0].email });
    await importCard(db, { id: owner, email: COHORT[0].email }, forgeDocument({ ...COHORT[0], ideaId, said: [], entries: [{ block: "value_proposition", text: entry }] }), testEmbed);
    const add = async (title: string, text: string, thin: boolean) => {
      const [row] = await db.insert(document).values({ sessionId: null, source: "paper", title, text: null }).returning({ id: document.id });
      await putArtifactText(db, { artifactId: row.id, sourceFormat: thin ? "tldr" : "abstract", parser: "test", text, provenance: thin ? { thin: true } : {} });
      return row.id;
    };
    thinId = await add("Thin at 0.80", thinText, true);
    fullId = await add("Full at 0.76", fullText, false);
    await embedPaperAbstracts(db, testEmbed);
  });

  it("is 0.9, and lists a full document at 0.76 before a thin one at 0.80, whose score stays its cosine", async () => {
    expect(THIN_FACTOR).toBe(0.9);
    const hits = (await priorArtFor(db, ideaId, 10)).filter((h) => h.documentId === thinId || h.documentId === fullId);
    expect(hits.map((h) => h.documentId)).toEqual([fullId, thinId]);
    expect(hits[0]).toMatchObject({ thin: false });
    expect(hits[0].score).toBeCloseTo(0.76, 2);
    expect(hits[1]).toMatchObject({ thin: true });
    expect(hits[1].score).toBeCloseTo(0.8, 2);
  });

  it("orders the reference path the same way", async () => {
    const rows = (await ideaVectors(db, [ideaId])).get(ideaId)!;
    const papers = await db
      .select({ documentId: document.id, kind: document.source, title: document.title, embedding: documentChunk.embedding, provenance: artifactTexts.provenance, addedAt: document.createdAt })
      .from(documentChunk)
      .innerJoin(document, eq(document.id, documentChunk.documentId))
      .innerJoin(artifactTexts, eq(artifactTexts.artifactId, document.id))
      .where(inArray(document.id, [thinId, fullId]));
    const scored = papers.map((p) => scorePaper(rows, { ...p, kind: p.kind as CorpusKind, embedding: p.embedding! }));
    expect(applyVerdicts(scored, [], []).map((h) => h.documentId)).toEqual([fullId, thinId]);
    expect(scored.find((h) => h.documentId === thinId)).toMatchObject({ thin: true });
    expect(scored.find((h) => h.documentId === thinId)!.score).toBeCloseTo(0.8, 2);
  });
});

const hit = (id: string, field: string | null) => ({ id, field });

describe("fieldQuota", () => {
  it("takes hits in order, at most three per field, until k are taken", () => {
    const hits = [
      hit("a", "Medicine"), hit("b", "Medicine"), hit("c", "Medicine"), hit("d", "Medicine"),
      hit("e", "Engineering"), hit("f", "Medicine"), hit("g", "Economics"),
    ];
    expect(fieldQuota(hits, 5).map((h) => h.id)).toEqual(["a", "b", "c", "e", "g"]);
  });

  it("counts a missing field as a bucket of its own", () => {
    const hits = [hit("a", null), hit("b", null), hit("c", null), hit("d", null), hit("e", "Medicine")];
    expect(fieldQuota(hits, 5).map((h) => h.id)).toEqual(["a", "b", "c", "e"]);
  });

  it("returns a short list rather than breaking the quota", () => {
    const hits = [hit("a", "X"), hit("b", "X"), hit("c", "X"), hit("d", "X")];
    expect(fieldQuota(hits, 10).map((h) => h.id)).toEqual(["a", "b", "c"]);
  });

  it("takes a custom cap, and Infinity turns the quota off", () => {
    const hits = [hit("a", "X"), hit("b", "X"), hit("c", "Y")];
    expect(fieldQuota(hits, 3, 1).map((h) => h.id)).toEqual(["a", "c"]);
    expect(fieldQuota(hits, 2, Infinity).map((h) => h.id)).toEqual(["a", "b"]);
  });
});
