/** Prior art for many cards in one statement is prior art for each card,
 *  hit for hit and in the same order. The corpus is written in two bulk
 *  inserts, so documents share a `created_at` and the order's last key, the
 *  document id, is what decides a tie at k. */
import { beforeAll, describe, expect, it } from "vitest";
import { COHORT, CORPUS, forgeDocument } from "../../evals/lodestone/cohort";
import type { Db } from "@/db/client";
import { document } from "@/db/schema";
import { putArtifactText } from "@/harness/canonical";
import { ensurePerson } from "@/harness/ledger";
import { enrollTestMember } from "@/pilot/test-fixtures";
import { importCard } from "./cards";
import { embedPaperAbstracts, fieldQuota, priorArtFor, priorArtForMany } from "./priorArt";
import { countingDb } from "./test-db";
import { testEmbed } from "./test-embed";

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
