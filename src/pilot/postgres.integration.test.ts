import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/db/client";
import { createCard, createSession, fieldsOf } from "@/db/cards";
import { cardRevision } from "@/db/review-schema";
import { pilotMembership } from "@/db/pilot-schema";
import { ensurePerson } from "@/harness/ledger";
import { createNeed } from "@/resources/service";
import { claimScheduledRun, executeRefreshRun } from "@/resources/refresh-runs";
import { acceptInvitation, createInvitation, revokeMembership } from "./membership";

const url = process.env.PILOT_POSTGRES_URL;
const suite = url ? describe : describe.skip;
const operatorEmail = "operator@pilot.invalid";
let client: ReturnType<typeof postgres>;
let db: Db;
let operatorId: string;
let participantId: string;

suite("real Postgres pilot contracts", () => {
  beforeAll(async () => {
    vi.stubEnv("PILOT_OPERATOR_EMAILS", operatorEmail);
    client = postgres(url!, { prepare: false, max: 4 });
    db = drizzle({ client, schema });
    operatorId = await ensurePerson(db, { name: "Operator", email: operatorEmail });
    participantId = await ensurePerson(db, { name: "Participant", email: "participant@pilot.invalid" });
  });

  afterAll(async () => { await client?.end(); });

  it("accepts an email-bound invitation and applies revocation atomically", async () => {
    const now = new Date("2026-09-06T12:00:00.000Z");
    const actor = { personId: operatorId, email: operatorEmail, emailVerified: true };
    const created = await createInvitation(db, actor, {
      email: "participant@pilot.invalid", noticeVersion: "participation-v1",
      expiresAt: new Date("2026-09-07T12:00:00.000Z"), memberKind: "participant",
    }, { now });
    await acceptInvitation(db, {
      personId: participantId, email: "participant@pilot.invalid", emailVerified: true,
    }, created.token, new Date("2026-09-06T12:01:00.000Z"));
    const card = await createCard(db, { sessionId: await createSession(db, participantId), door: "blank" });
    const [revision] = await db.insert(cardRevision).values({
      cardId: card.id, ownerId: participantId, version: 1, visibility: "cohort", fields: fieldsOf(card),
    }).returning();

    await revokeMembership(db, actor, participantId, new Date("2026-09-06T12:02:00.000Z"));
    const [membership] = await db.select().from(pilotMembership).where(eq(pilotMembership.personId, participantId));
    const [publication] = await db.select().from(cardRevision).where(eq(cardRevision.id, revision.id));
    expect(membership.status).toBe("revoked");
    expect(publication.revokedAt).toEqual(new Date("2026-09-06T12:02:00.000Z"));
  });

  it("serializes simultaneous global claims through the seeded lease row", async () => {
    const ownerId = await ensurePerson(db, { name: "Refresh Owner", email: "refresh@pilot.invalid" });
    const actor = { personId: operatorId, email: operatorEmail, emailVerified: true };
    const invite = await createInvitation(db, actor, {
      email: "refresh@pilot.invalid", noticeVersion: "participation-v1",
      expiresAt: new Date("2026-09-07T12:00:00.000Z"), memberKind: "participant",
    }, { now: new Date("2026-09-06T12:00:00.000Z") });
    await acceptInvitation(db, { personId: ownerId, email: "refresh@pilot.invalid", emailVerified: true }, invite.token, new Date("2026-09-06T12:01:00.000Z"));
    const card = await createCard(db, { sessionId: await createSession(db, ownerId), door: "blank" });
    await createNeed(db, ownerId, { cardId: card.id, title: "Postgres fencing", criteria: "atomic lease", monitoring: true });
    const now = new Date();
    const occurrence = new Date(now);
    occurrence.setUTCHours(2, 0, 0, 0);
    if (occurrence > now) occurrence.setUTCDate(occurrence.getUTCDate() - 1);
    const claims = await Promise.all([
      claimScheduledRun(db, occurrence.toISOString(), now),
      claimScheduledRun(db, occurrence.toISOString(), now),
    ]);
    expect(claims.map((claim) => claim.kind).sort()).toEqual(["busy", "claimed"]);
    const claimed = claims.find((claim) => claim.kind === "claimed");
    if (!claimed || claimed.kind !== "claimed") throw new Error("Expected one claimed worker");
    await expect(executeRefreshRun(db, claimed.handle, { now: () => now })).resolves.toMatchObject({ checked: 1 });
  });
});
