import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, type Db } from "@/db/client";
import { pilotInvitation } from "@/db/pilot-schema";
import { ensurePerson } from "@/harness/ledger";
import { createInvitation, type VerifiedPilotActor } from "./membership";
import { deliverPilotInvitation, type PilotInvitationMessage } from "./delivery";

const NOW = new Date("2026-09-06T12:00:00.000Z");
let db: Db;
let operator: VerifiedPilotActor;

beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.stubEnv("PILOT_OPERATOR_EMAILS", "operator@example.test");
  db = await createPgliteDb();
  operator = {
    personId: await ensurePerson(db, { name: "Operator", email: "operator@example.test" }),
    email: "operator@example.test",
    emailVerified: true,
  };
});

describe("pilot invitation delivery", () => {
  it("uses the injected email transport and records successful delivery", async () => {
    const created = await createInvitation(db, operator, {
      email: "student@example.test",
      noticeVersion: "participation-v1",
      expiresAt: new Date("2026-09-13T12:00:00.000Z"),
    }, { now: NOW, token: "invitation-secret-token" });
    const messages: PilotInvitationMessage[] = [];

    const result = await deliverPilotInvitation(
      db,
      operator,
      created,
      "https://pilot.example.test",
      async (message) => { messages.push(message); },
      NOW,
    );

    expect(result.deliveryStatus).toBe("sent");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(expect.objectContaining({
      email: "student@example.test",
      subject: "Your Thesis Forge pilot invitation",
    }));
    expect(messages[0].text).toContain("https://pilot.example.test/pilot/accept?token=invitation-secret-token");
  });

  it("keeps the invitation recoverable and stores no transport error or raw token", async () => {
    const created = await createInvitation(db, operator, {
      email: "failed@example.test",
      noticeVersion: "participation-v1",
      expiresAt: new Date("2026-09-13T12:00:00.000Z"),
    }, { now: NOW, token: "do-not-persist-this-token" });

    const result = await deliverPilotInvitation(
      db,
      operator,
      created,
      "https://pilot.example.test",
      async () => { throw new Error("provider secret=super-secret do-not-persist-this-token"); },
      NOW,
    );
    const [stored] = await db.select().from(pilotInvitation)
      .where(eq(pilotInvitation.id, created.invitation.id));

    expect(result.deliveryStatus).toBe("failed");
    expect(stored.status).toBe("pending");
    expect(stored.deliveryErrorCode).toBe("delivery_failed");
    expect(JSON.stringify(stored)).not.toContain("super-secret");
    expect(JSON.stringify(stored)).not.toContain("do-not-persist-this-token");
  });
});

