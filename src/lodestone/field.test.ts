/** The field around a card: its peers and prior art as one list, sorted by
 *  closeness, with the neighbour line and the viewer's standing attached. */
import { beforeAll, describe, expect, it } from "vitest";
import { COHORT, CORPUS, forgeDocument } from "../../evals/lodestone/cohort";
import { createPgliteDb, type Db } from "@/db/client";
import { document } from "@/db/schema";
import { putArtifactText } from "@/harness/canonical";
import { ensurePerson } from "@/harness/ledger";
import { enrollTestMember } from "@/pilot/test-fixtures";
import { importCard, setVisibility } from "./cards";
import { fieldFor } from "./field";
import { CLOSE } from "./geometry";
import { embedPaperAbstracts } from "./priorArt";
import { testEmbed } from "./test-embed";

let db: Db;
const people = new Map<string, string>();
const [sam, priya, third, fourth] = COHORT;
const stranger = { name: "Not A Member", email: "outsider@cohort.test" };
const owner = (email: string) => ({ id: people.get(email)!, email });

beforeAll(async () => {
  db = await createPgliteDb();
  for (const m of [sam, priya, third, fourth]) {
    const id = await ensurePerson(db, { name: m.name, email: m.email });
    people.set(m.email, id);
    await enrollTestMember(db, id);
  }
  people.set(stranger.email, await ensurePerson(db, stranger));
  for (const p of CORPUS) {
    const [row] = await db.insert(document).values({ sessionId: null, source: "paper", title: p.title, text: null }).returning();
    await putArtifactText(db, { artifactId: row.id, sourceFormat: "abstract", parser: "test", text: p.abstract, provenance: {} });
  }
  await embedPaperAbstracts(db, testEmbed);
  for (const m of [sam, priya, third, fourth]) await importCard(db, owner(m.email), forgeDocument(m), testEmbed);
  await setVisibility(db, people.get(priya.email)!, priya.ideaId, "cohort");
  await setVisibility(db, people.get(third.email)!, third.ideaId, "cohort");
  await importCard(db, owner(stranger.email), { ...forgeDocument(sam), id: "e".repeat(32), title: "An outsider's card" }, testEmbed);
}, 60_000);

describe("fieldFor", () => {
  it("lists peers and papers together, closest first, each marked against the line", async () => {
    const field = await fieldFor(db, people.get(sam.email)!, sam.ideaId);
    expect(field).not.toBeNull();
    expect(field!.center).toMatchObject({ ideaId: sam.ideaId, title: sam.title, owner: sam.name, mine: true });
    expect(field!.member).toBe(true);
    expect(field!.hasVectors).toBe(true);
    expect(field!.line).toBe(CLOSE);
    const scores = field!.nodes.map((n) => n.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(field!.nodes.length).toBeGreaterThan(0);
    for (const n of field!.nodes) expect(n.close).toBe(n.score >= CLOSE);
    const peers = field!.nodes.filter((n) => n.kind === "peer");
    expect(peers.map((n) => n.ideaId).sort()).toEqual([priya.ideaId, third.ideaId].sort());
    for (const p of peers) expect(p.href).toBe(`/lodestone/cards/${p.ideaId}`);
    expect(field!.nodes.some((n) => n.kind === "paper")).toBe(true);
  });
  it("gives a non-member prior art but no peers", async () => {
    const field = await fieldFor(db, people.get(stranger.email)!, "e".repeat(32));
    expect(field!.member).toBe(false);
    expect(field!.nodes.some((n) => n.kind === "peer")).toBe(false);
    expect(field!.nodes.some((n) => n.kind === "paper")).toBe(true);
  });
  it("is null for a card the viewer cannot see", async () => {
    expect(await fieldFor(db, people.get(sam.email)!, fourth.ideaId)).toBeNull();
    expect(await fieldFor(db, people.get(sam.email)!, "0".repeat(32))).toBeNull();
  });
});
