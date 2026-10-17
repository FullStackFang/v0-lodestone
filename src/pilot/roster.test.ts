/** The roster's membership actions on an in-memory ledger: who may run them,
 *  what an invitation writes and sends, and what a revoke takes out of the
 *  cohort's lists. */
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { COHORT, forgeDocument } from "../../evals/lodestone/cohort";
import { createPgliteDb, type Db } from "@/db/client";
import { pilotInvitation } from "@/db/pilot-schema";
import { forgeCard } from "@/db/schema";
import type { EmailMessage } from "@/auth/delivery";
import { ensurePerson } from "@/harness/ledger";
import { importCard, setVisibility } from "@/lodestone/cards";
import { digestFor } from "@/lodestone/digest";
import { cohortMap } from "@/lodestone/map";
import { peersFor } from "@/lodestone/peers";
import { testEmbed } from "@/lodestone/test-embed";
import { isOperatorMember, listPilotRoster, revokeMembership, type VerifiedPilotActor } from "./membership";
import { inviteMember, NOTICE_VERSION } from "./roster";
import { enrollTestMember } from "./test-fixtures";

let db: Db;
const people = new Map<string, string>();
const op = { name: "Membership Operator", email: "kind-operator@cohort.test" };
const plain = { name: "Plain Member", email: "plain@cohort.test" };
const actor = (email: string): VerifiedPilotActor => ({ personId: people.get(email)!, email, emailVerified: true });
const outbox = () => {
  const sent: EmailMessage[] = [];
  return { sent, deliver: async (m: EmailMessage) => void sent.push(m) };
};

beforeAll(async () => {
  db = await createPgliteDb();
  for (const m of COHORT) {
    const id = await ensurePerson(db, { name: m.name, email: m.email });
    people.set(m.email, id);
    await enrollTestMember(db, id);
  }
  people.set(op.email, await ensurePerson(db, op));
  await enrollTestMember(db, people.get(op.email)!, "operator");
  people.set(plain.email, await ensurePerson(db, plain));
  await enrollTestMember(db, people.get(plain.email)!, "participant");
  for (const m of COHORT) {
    await importCard(db, { id: people.get(m.email)!, email: m.email }, forgeDocument(m), testEmbed);
    await setVisibility(db, people.get(m.email)!, m.ideaId, "cohort");
  }
}, 60_000);

afterEach(() => vi.unstubAllEnvs());

describe("the operator predicate", () => {
  it("admits a listed email and a membership of kind operator, and no one else", async () => {
    vi.stubEnv("PILOT_OPERATOR_EMAILS", "listed@cohort.test");
    expect(await isOperatorMember(db, { id: people.get(plain.email)!, email: "Listed@Cohort.test" })).toBe(true);
    expect(await isOperatorMember(db, { id: people.get(op.email)!, email: op.email })).toBe(true);
    expect(await isOperatorMember(db, { id: people.get(plain.email)!, email: plain.email })).toBe(false);
  });
});

describe("inviting", () => {
  it("lets a membership-kind operator outside PILOT_OPERATOR_EMAILS invite", async () => {
    vi.stubEnv("PILOT_OPERATOR_EMAILS", "");
    const mail = outbox();
    const now = new Date("2026-10-15T12:00:00Z");
    const out = await inviteMember(db, actor(op.email), "Arriving@Example.edu", { now, deliver: mail.deliver, origin: "https://lodestone.invalid" });
    expect(out.delivered).toBe(true);

    const rows = await db.select().from(pilotInvitation).where(eq(pilotInvitation.email, "arriving@example.edu"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "pending", noticeVersion: NOTICE_VERSION, deliveryStatus: "sent", memberKind: "participant" });
    expect(rows[0].expiresAt.getTime() - now.getTime()).toBe(14 * 24 * 60 * 60 * 1000);

    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].email).toBe("arriving@example.edu");
    expect(mail.sent[0].text).toMatch(/https:\/\/lodestone\.invalid\/lodestone\/join\/[\w-]{20,}/);

    const roster = await listPilotRoster(db, actor(op.email));
    expect(roster.invitations.filter((i) => i.email === "arriving@example.edu")).toHaveLength(1);
  });

  it("keeps the invitation and records the failure when the email does not go", async () => {
    vi.stubEnv("PILOT_OPERATOR_EMAILS", "");
    const out = await inviteMember(db, actor(op.email), "bounce@example.edu", { deliver: async () => { throw new Error("Email could not be delivered."); } });
    expect(out.delivered).toBe(false);
    const [row] = await db.select().from(pilotInvitation).where(eq(pilotInvitation.email, "bounce@example.edu"));
    expect(row).toMatchObject({ status: "pending", deliveryStatus: "failed", deliveryErrorCode: "Email could not be delivered." });
  });

  it("refuses a member who is not an operator", async () => {
    vi.stubEnv("PILOT_OPERATOR_EMAILS", "");
    const mail = outbox();
    await expect(inviteMember(db, actor(plain.email), "someone@example.edu", { deliver: mail.deliver })).rejects.toThrow(/operator/);
    expect(mail.sent).toHaveLength(0);
  });
});

describe("revoking", () => {
  it("takes the member's card out of the map, every peer list and the digest, and keeps the row", async () => {
    vi.stubEnv("PILOT_OPERATOR_EMAILS", "");
    const sam = COHORT[0];
    const jonas = COHORT[7];
    const since = new Date("2020-01-01T00:00:00Z");
    const mapIds = async () => (await cohortMap(db)).regions.flatMap((r) => r.cards.map((c) => c.ideaId));
    const digestIds = async () => (await digestFor(db, people.get(sam.email)!, since, new Date(), { paperFloor: 0.2 })).sections.flatMap((s) => s.peers.map((p) => p.ideaId));
    expect(await mapIds()).toContain(jonas.ideaId);
    expect((await peersFor(db, sam.ideaId, 30)).map((p) => p.ideaId)).toContain(jonas.ideaId);
    expect(await digestIds()).toContain(jonas.ideaId);

    await revokeMembership(db, actor(op.email), people.get(jonas.email)!);

    expect(await mapIds()).not.toContain(jonas.ideaId);
    expect((await peersFor(db, sam.ideaId, 30)).map((p) => p.ideaId)).not.toContain(jonas.ideaId);
    expect(await digestIds()).not.toContain(jonas.ideaId);
    const [row] = await db.select().from(forgeCard).where(eq(forgeCard.ideaId, jonas.ideaId));
    expect(row.visibility).toBe("cohort");
  });
});
