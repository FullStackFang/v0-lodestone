import { beforeAll, describe, expect, it, vi } from "vitest";
import { getDb, type Db } from "@/db/client";
import { applyPatch, createCard, createSession } from "@/db/cards";
import { ensurePerson } from "@/harness/ledger";
import { publishRevision, revokeRevision } from "@/review/revisions";
import { savedReferences } from "@/library/library";
import { saveComponent, unsaveComponent } from "./actions";
import { enrollTestMember } from "@/pilot/test-fixtures";

const actor = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/session", () => ({ requirePerson: async () => actor }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let db: Db;
let owner: string;
beforeAll(async () => {
  db = await getDb();
  owner = await ensurePerson(db, { name: "Source author", email: "library-action-author@example.edu" });
  actor.id = await ensurePerson(db, { name: "Reference reader", email: "library-action-reader@example.edu" });
  await enrollTestMember(db, owner);
  await enrollTestMember(db, actor.id);
});
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

describe("library mutation feedback", () => {
  it("returns an actionable error when a displayed source is revoked before saving", async () => {
    const source = await createCard(db, { sessionId: await createSession(db, owner), door: "blank" });
    await applyPatch(db, source, { offering: "A source component" });
    const revision = await publishRevision(db, owner, source.id, "cohort");
    const destination = await createCard(db, { sessionId: await createSession(db, actor.id), door: "blank" });
    await revokeRevision(db, owner, revision.id);
    await expect(saveComponent({}, form({ cardId: destination.id, revisionId: revision.id, component: "offering" }))).resolves.toMatchObject({ error: "Published component is unavailable." });
    expect(await savedReferences(db, actor.id, destination.id)).toHaveLength(0);
  });

  it("returns validation errors when removing an invalid reference instead of throwing", async () => {
    await expect(unsaveComponent({}, form({ id: "invalid" }))).resolves.toMatchObject({ error: expect.any(String) });
  });

  it("returns success receipts for saving and removing a reference", async () => {
    const source = await createCard(db, { sessionId: await createSession(db, owner), door: "blank" });
    await applyPatch(db, source, { offering: "A recoverable reference" });
    const revision = await publishRevision(db, owner, source.id, "cohort");
    const destination = await createCard(db, { sessionId: await createSession(db, actor.id), door: "blank" });
    await expect(saveComponent({}, form({ cardId: destination.id, revisionId: revision.id, component: "offering" }))).resolves.toEqual({ message: "Reference saved." });
    const [reference] = await savedReferences(db, actor.id, destination.id);
    await expect(unsaveComponent({}, form({ id: reference.id }))).resolves.toEqual({ message: "Reference removed." });
    expect(await savedReferences(db, actor.id, destination.id)).toHaveLength(0);
  });

  it("removes a saved reference after its source publication is revoked", async () => {
    const source = await createCard(db, { sessionId: await createSession(db, owner), door: "blank" });
    await applyPatch(db, source, { offering: "A source to revoke" });
    const revision = await publishRevision(db, owner, source.id, "cohort");
    const destination = await createCard(db, { sessionId: await createSession(db, actor.id), door: "blank" });
    await saveComponent({}, form({ cardId: destination.id, revisionId: revision.id, component: "offering" }));
    await revokeRevision(db, owner, revision.id);
    const [reference] = await savedReferences(db, actor.id, destination.id);
    expect(reference.component).toBeNull();
    await expect(unsaveComponent({}, form({ id: reference.id }))).resolves.toEqual({ message: "Reference removed." });
    expect(await savedReferences(db, actor.id, destination.id)).toHaveLength(0);
  });
});
