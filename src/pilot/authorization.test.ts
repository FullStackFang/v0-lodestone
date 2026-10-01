import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, type Db } from "@/db/client";
import { createCard, createSession } from "@/db/cards";
import { thesisCard } from "@/db/schema";
import { ensurePerson } from "@/harness/ledger";
import { listComponents, saveReference, savedReferences } from "@/library/library";
import { createNeed, assertCurator, updateNeed } from "@/resources/service";
import {
  ideasForOwner,
  publishRevision,
  readPublication,
  revokeRevision,
  saveIdea,
} from "@/review/revisions";
import { revokeMembership, type VerifiedPilotActor } from "./membership";
import { enrollTestMember } from "./test-fixtures";

let db: Db;
let ownerId: string;
let peerId: string;
let nonmemberId: string;
let operator: VerifiedPilotActor;
let ownerCardId: string;
let ownerSlug: string;

beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.stubEnv("PILOT_OPERATOR_EMAILS", "operator@example.test");
  db = await createPgliteDb();
  ownerId = await ensurePerson(db, { name: "Owner", email: "owner@example.test" });
  peerId = await ensurePerson(db, { name: "Peer", email: "peer@example.test" });
  nonmemberId = await ensurePerson(db, { name: "Former", email: "former@example.test" });
  operator = {
    personId: await ensurePerson(db, { name: "Operator", email: "operator@example.test" }),
    email: "operator@example.test",
    emailVerified: true,
  };
  await enrollTestMember(db, ownerId);
  await enrollTestMember(db, peerId);
  const ownerCard = await createCard(db, { sessionId: await createSession(db, ownerId), door: "blank" });
  ownerCardId = ownerCard.id;
  ownerSlug = ownerCard.slug;
  await db.update(thesisCard).set({ offering: "A pilot-safe idea" }).where(eq(thesisCard.id, ownerCardId));
});

describe("pilot participation boundaries", () => {
  it("blocks direct idea writes for nonmembers while retaining inactive owner reads and revocation", async () => {
    const formerCard = await createCard(db, { sessionId: await createSession(db, nonmemberId), door: "blank" });
    await expect(saveIdea(db, nonmemberId, formerCard.id, { offering: "Unauthorized edit" }))
      .rejects.toThrow(/active pilot membership/i);

    await saveIdea(db, ownerId, ownerCardId, { offering: "Authorized edit" });
    const unlisted = await publishRevision(db, ownerId, ownerCardId, "unlisted");
    await revokeMembership(db, operator, ownerId);

    await expect(saveIdea(db, ownerId, ownerCardId, { offering: "Edit after removal" }))
      .rejects.toThrow(/active pilot membership/i);
    expect(await ideasForOwner(db, ownerId)).toHaveLength(1);
    await expect(revokeRevision(db, ownerId, unlisted.id)).resolves.toBeUndefined();
  });

  it("requires active viewer and source membership for cohort reads but keeps unlisted bearer links", async () => {
    const unlisted = await publishRevision(db, ownerId, ownerCardId, "unlisted");
    const cohort = await publishRevision(db, ownerId, ownerCardId, "cohort");

    expect((await readPublication(db, ownerSlug, peerId, cohort.version))?.revision.id).toBe(cohort.id);
    expect(await readPublication(db, ownerSlug, nonmemberId, cohort.version)).toBeNull();
    expect((await readPublication(db, ownerSlug, null, unlisted.version))?.revision.id).toBe(unlisted.id);

    await revokeMembership(db, operator, ownerId);
    expect(await readPublication(db, ownerSlug, peerId, cohort.version)).toBeNull();
    expect((await readPublication(db, ownerSlug, null, unlisted.version))?.revision.id).toBe(unlisted.id);
  });

  it("filters component discovery on both memberships and redacts a saved unavailable source", async () => {
    const source = await publishRevision(db, ownerId, ownerCardId, "cohort");
    const peerCard = await createCard(db, { sessionId: await createSession(db, peerId), door: "blank" });
    const page = await listComponents(db, peerId, {});
    expect(page.items.length).toBeGreaterThan(0);
    await expect(listComponents(db, nonmemberId, {})).rejects.toThrow(/active pilot membership/i);
    await saveReference(db, peerId, {
      cardId: peerCard.id, revisionId: source.id, component: page.items[0].key, note: "Keep the attribution",
    });

    await revokeMembership(db, operator, ownerId);
    expect((await listComponents(db, peerId, {})).items).toEqual([]);
    const [saved] = await savedReferences(db, peerId, peerCard.id);
    expect(saved.note).toBe("Keep the attribution");
    expect(saved.component).toBeNull();
  });

  it("requires membership independently for personal resource and curator mutations", async () => {
    const formerCard = await createCard(db, { sessionId: await createSession(db, nonmemberId), door: "blank" });
    await expect(createNeed(db, nonmemberId, {
      cardId: formerCard.id, title: "Blocked", criteria: "No active membership",
    })).rejects.toThrow(/active pilot membership/i);

    const need = await createNeed(db, ownerId, {
      cardId: ownerCardId, title: "Allowed", criteria: "Current membership",
    });
    await revokeMembership(db, operator, ownerId);
    await expect(updateNeed(db, ownerId, need.id, {
      title: "Blocked later", criteria: "Membership was revoked", status: "paused", monitoring: false,
    })).rejects.toThrow(/active pilot membership/i);

    vi.stubEnv("RESOURCE_CURATOR_EMAILS", operator.email);
    await expect(assertCurator(db, operator.personId)).rejects.toThrow(/active pilot membership/i);
    await enrollTestMember(db, operator.personId, "operator");
    await expect(assertCurator(db, operator.personId)).resolves.toEqual(expect.objectContaining({ id: operator.personId }));
  });
});
