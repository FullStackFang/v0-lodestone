import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createPgliteDb, type Db } from "@/db/client";
import { ensurePerson } from "@/harness/ledger";
import { applyPatch, createCard, createSession, getCard } from "@/db/cards";
import { publishRevision, revokeRevision } from "@/review/revisions";
import { listComponents, saveReference, savedReferences } from "./library";
import { thesisCard } from "@/db/schema";
import { cardRevision } from "@/db/review-schema";
import { componentReference } from "@/db/library-schema";
import { EMPTY_FIELDS } from "@/schema/card";
import { enrollTestMember } from "@/pilot/test-fixtures";

let db: Db;
let owner: string;
let peer: string;
beforeAll(async () => {
  db = await createPgliteDb();
  owner = await ensurePerson(db, { name: "Library owner", email: "library@example.edu" });
  peer = await ensurePerson(db, { name: "Peer", email: "library-peer@example.edu" });
  await enrollTestMember(db, owner);
  await enrollTestMember(db, peer);
});
async function idea(personId: string, offering: string) {
  const c = await createCard(db, { sessionId: await createSession(db, personId), door: "blank" });
  return applyPatch(db, c, { offering, value_proposition: "Reduce grocery spoilage", segment: { description: "Independent grocers", findability_evidence: null, homogeneity_claim: null, size_estimate: null, four_question_test: null, refinement: null } });
}

describe("published component library", () => {
  it("searches published context without disclosing private edits or unlisted ideas", async () => {
    const card = await idea(owner, "Published shelf planning");
    const revision = await publishRevision(db, owner, card.id, "cohort");
    await applyPatch(db, card, { value_proposition: "Secret unreleased pricing" });
    await publishRevision(db, owner, (await idea(owner, "Private specimen")).id, "unlisted");
    const result = await listComponents(db, peer, { query: "spoilage grocers", facet: "purpose" });
    expect(result.items.some((r) => r.revisionId === revision.id)).toBe(true);
    expect(result.items.every((r) => r.facet === "purpose")).toBe(true);
    expect((await listComponents(db, peer, { query: "Secret unreleased" })).items).toHaveLength(0);
    expect((await listComponents(db, peer, { query: "Private specimen" })).items).toHaveLength(0);
  });
  it("does not resurrect older publications after the latest is revoked", async () => {
    const card = await idea(owner, "Revocation specimen");
    await publishRevision(db, owner, card.id, "cohort");
    const latest = await publishRevision(db, owner, card.id, "cohort");
    await revokeRevision(db, owner, latest.id);
    expect((await listComponents(db, peer, { query: "Revocation specimen" })).items).toHaveLength(0);
  });
  it("saves references idempotently, preserves evidence, and redacts revoked sources", async () => {
    const source = await idea(owner, "Reference specimen");
    const revision = await publishRevision(db, owner, source.id, "cohort");
    const destination = await idea(peer, "Destination");
    const input = { cardId: destination.id, revisionId: revision.id, component: "value_proposition", note: "Compare the customer context" };
    await saveReference(db, peer, input);
    await saveReference(db, peer, input);
    expect(await savedReferences(db, peer, destination.id)).toHaveLength(1);
    expect((await getCard(db, destination.id))?.evidence).toEqual(destination.evidence);
    await expect(saveReference(db, owner, input)).rejects.toThrow("not your idea");
    await revokeRevision(db, owner, revision.id);
    const saved = await savedReferences(db, peer, destination.id);
    expect(saved[0].component).toBeNull();
  });

  it("finds an older matching publication and retains saved references beyond one thousand", async () => {
    const sessionId = await createSession(db, owner);
    const cards = Array.from({ length: 1001 }, (_, i) => ({ id: randomUUID(), sessionId, slug: `bulk-${i}-${randomUUID()}`, provenance: { source: "chat" as const, doc_id: null } }));
    await db.insert(thesisCard).values(cards);
    const revisions = await db.insert(cardRevision).values(cards.map((card, i) => ({ cardId: card.id, ownerId: owner, version: 1, visibility: "cohort" as const, fields: { ...EMPTY_FIELDS, offering: i === 0 ? "Older exact-match needle" : "Newer bulk publication" }, createdAt: new Date(Date.UTC(2027, 0, 1) + i * 1000) }))).returning();
    const result = await listComponents(db, peer, { query: "Older exact-match needle" });
    expect(result.items).toContainEqual(expect.objectContaining({ revisionId: revisions[0].id }));
    const destination = await idea(peer, "Bulk reference destination");
    await db.insert(componentReference).values(revisions.map((revision) => ({ cardId: destination.id, personId: peer, revisionId: revision.id, component: "offering", note: "" })));
    expect(await savedReferences(db, peer, destination.id)).toHaveLength(1001);
  }, 20_000);

  it("clamps an out-of-range page to the actual last page without an arbitrary page ceiling", async () => {
    const result = await listComponents(db, peer, { query: "Older exact-match needle", page: 1001 });
    expect(result.page).toBe(result.pages);
    expect(result.page).toBe(1);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.length).toBeLessThanOrEqual(24);
  });
});
