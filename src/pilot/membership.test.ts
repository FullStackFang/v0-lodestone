import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { ensurePerson } from "@/harness/ledger";
import { isCuratorEmail } from "@/resources/service";
import {
  acceptInvitation,
  assertPilotOperator,
  createInvitation,
  invitationAcceptanceState,
  isActiveMember,
  listPilotRoster,
  renewInvitation,
  revokeMembership,
  type VerifiedPilotActor,
} from "./membership";

const NOW = new Date("2026-09-06T12:00:00.000Z");
const LATER = new Date("2026-09-07T12:00:00.000Z");

let db: Db;
let operator: VerifiedPilotActor;
let participant: VerifiedPilotActor;

beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.stubEnv("PILOT_OPERATOR_EMAILS", "operator@example.test");
  db = await createPgliteDb();
  operator = {
    personId: await ensurePerson(db, { name: "Operator", email: "operator@example.test" }),
    email: "Operator@Example.Test",
    emailVerified: true,
  };
  participant = {
    personId: await ensurePerson(db, { name: "Participant", email: "participant@example.test" }),
    email: "participant@example.test",
    emailVerified: true,
  };
});

describe("pilot admission", () => {
  it("rejects an expired invitation and a verified identity with the wrong email", async () => {
    const wrongPersonId = await ensurePerson(db, { name: "Wrong", email: "wrong@example.test" });
    const invitation = await createInvitation(db, operator, {
      email: " Participant@Example.Test ", noticeVersion: "participation-v1", expiresAt: LATER,
    }, { now: NOW, token: "expiry-token" });

    await expect(acceptInvitation(db, {
      personId: wrongPersonId, email: "wrong@example.test", emailVerified: true,
    }, invitation.token, NOW)).rejects.toThrow(/email/i);
    await expect(acceptInvitation(db, {
      ...participant, emailVerified: false,
    }, invitation.token, NOW)).rejects.toThrow(/verified/i);
    await expect(acceptInvitation(db, participant, invitation.token, new Date("2026-09-07T12:00:00.001Z")))
      .rejects.toThrow(/expired/i);
    expect(await isActiveMember(db, participant.personId)).toBe(false);
  });

  it("accepts a current invitation once under concurrent same-person replay", async () => {
    const invitation = await createInvitation(db, operator, {
      email: participant.email, noticeVersion: "participation-v1", expiresAt: LATER,
    }, { now: NOW, token: "concurrent-token" });

    const [first, second] = await Promise.all([
      acceptInvitation(db, participant, invitation.token, NOW),
      acceptInvitation(db, participant, invitation.token, NOW),
    ]);

    expect(first.personId).toBe(participant.personId);
    expect(second.personId).toBe(participant.personId);
    expect(first.invitationId).toBe(invitation.invitation.id);
    expect(second.invitationId).toBe(invitation.invitation.id);
    expect(await isActiveMember(db, participant.personId)).toBe(true);
  });

  it("requires a new invitation to reactivate a revoked membership", async () => {
    const first = await createInvitation(db, operator, {
      email: participant.email, noticeVersion: "participation-v1", expiresAt: LATER,
    }, { now: NOW, token: "first-token" });
    await acceptInvitation(db, participant, first.token, NOW);
    await revokeMembership(db, operator, participant.personId, new Date("2026-09-06T13:00:00.000Z"));

    await expect(acceptInvitation(db, participant, first.token, new Date("2026-09-06T14:00:00.000Z")))
      .rejects.toThrow(/new invitation/i);
    expect(await isActiveMember(db, participant.personId)).toBe(false);

    const second = await renewInvitation(db, operator, {
      email: participant.email, noticeVersion: "participation-v2", expiresAt: new Date("2026-09-08T12:00:00.000Z"),
    }, { now: new Date("2026-09-06T15:00:00.000Z"), token: "second-token" });
    const membership = await acceptInvitation(db, participant, second.token, new Date("2026-09-06T16:00:00.000Z"));
    expect(membership.status).toBe("active");
    expect(membership.noticeVersion).toBe("participation-v2");
    expect(membership.invitationId).toBe(second.invitation.id);
  });

  it("keeps operator, curator and membership authorization independent", async () => {
    vi.stubEnv("RESOURCE_CURATOR_EMAILS", "curator@example.test");
    const curator = {
      personId: await ensurePerson(db, { name: "Curator", email: "curator@example.test" }),
      email: "curator@example.test",
      emailVerified: true,
    };

    await expect(assertPilotOperator(operator)).resolves.toEqual(operator);
    await expect(assertPilotOperator(curator)).rejects.toThrow(/operator/i);
    expect(isCuratorEmail(operator.email)).toBe(false);
    expect(isCuratorEmail(curator.email)).toBe(true);
    expect(await isActiveMember(db, operator.personId)).toBe(false);

    const invitation = await createInvitation(db, operator, {
      email: participant.email, noticeVersion: "participation-v1", expiresAt: LATER,
    }, { now: NOW, token: "member-token" });
    await acceptInvitation(db, participant, invitation.token, NOW);
    await expect(assertPilotOperator(participant)).rejects.toThrow(/operator/i);
  });

  it("returns safe acceptance states and protects the roster from nonoperators", async () => {
    const invitation = await createInvitation(db, operator, {
      email: participant.email, noticeVersion: "participation-v1", expiresAt: LATER,
    }, { now: NOW, token: "state-token" });

    await expect(listPilotRoster(db, participant)).rejects.toThrow(/operator/i);
    expect(await invitationAcceptanceState(db, participant, "missing-token", NOW)).toEqual({ status: "unavailable" });
    expect(await invitationAcceptanceState(db, participant, invitation.token, NOW)).toEqual({
      status: "ready", noticeVersion: "participation-v1", expiresAt: LATER,
    });
    expect(await invitationAcceptanceState(db, participant, invitation.token, new Date("2026-09-07T12:00:00.001Z")))
      .toEqual({ status: "expired" });

    const roster = await listPilotRoster(db, operator);
    expect(roster.invitations).toEqual([expect.objectContaining({
      id: invitation.invitation.id,
      email: participant.email,
      status: "pending",
    })]);
    expect(roster.memberships).toEqual([]);
  });
});
