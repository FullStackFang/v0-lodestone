import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PilotOperatorPage from "./page";

vi.mock("@/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/lib/session", () => ({ requirePerson: async () => ({
  id: "00000000-0000-4000-8000-000000000001", email: "operator@example.test", name: "Operator",
}) }));
vi.mock("@/pilot/membership", () => ({ listPilotRoster: async () => ({
  invitations: [{
    id: "00000000-0000-4000-8000-000000000011",
    email: "student@example.test",
    noticeVersion: "participation-v1",
    memberKind: "participant",
    status: "pending",
    expiresAt: new Date("2026-09-13T12:00:00.000Z"),
    deliveryStatus: "failed",
    deliveryAttemptedAt: new Date("2026-09-06T12:00:00.000Z"),
    deliveryErrorCode: "delivery_failed",
    createdAt: new Date("2026-09-06T12:00:00.000Z"),
  }],
  memberships: [{
    personId: "00000000-0000-4000-8000-000000000021",
    name: "Member",
    email: "member@example.test",
    status: "active",
    memberKind: "participant",
    noticeVersion: "participation-v1",
    acceptedAt: new Date("2026-09-06T12:00:00.000Z"),
    revokedAt: null,
  }],
}) }));
vi.mock("@/resources/refresh-runs", () => ({ operatorRefreshStatus: async () => ({ health: { state: "never_run" }, runs: [] }) }));
vi.mock("./actions", () => ({ createAndSendInvitation: async () => ({}), renewAndSendInvitation: async () => ({}), revokePilotInvitation: async () => ({}), revokePilotMember: async () => ({}), retryGlobalRefresh: async () => ({}), runGlobalRefresh: async () => ({}) }));

describe("pilot operator roster", () => {
  it("shows delivery failure recovery and current membership controls without tokens", async () => {
    const html = renderToStaticMarkup(await PilotOperatorPage());
    expect(html).toContain("student@example.test");
    expect(html).toContain("Delivery failed");
    expect(html).toContain("Renew and resend");
    expect(html).toContain("member@example.test");
    expect(html).toContain("Revoke membership");
    expect(html).toContain("never run");
    expect(html).not.toContain("token_hash");
  });
});
