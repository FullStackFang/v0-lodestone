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
import { embedPaperAbstracts, priorArtFor, priorArtForMany } from "./priorArt";
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
        const many = await priorArtForMany(db, ids, k, at);
        expect([...many.keys()].sort()).toEqual([...ids].sort());
        for (const id of ids) expect(many.get(id)).toEqual(await priorArtFor(db, id, k, at));
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
    const hits = (await priorArtFor(db, COHORT[0].ideaId, CORPUS.length + 1)).filter((h) => h.title.startsWith(CORPUS[3].title));
    expect(hits).toHaveLength(2);
    expect(hits[0].score).toBe(hits[1].score);
    expect(hits[0].documentId < hits[1].documentId).toBe(true);
  });

  it("reads vectors, cards, rankings and metadata once each, however many cards", async () => {
    for (const at of [undefined, since]) {
      const from = statements.length;
      await priorArtForMany(db, ids, 3, at);
      expect(statements.slice(from)).toHaveLength(4);
    }
  });
});
