import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AcceptPilotInvitationPage from "./page";

const state = vi.hoisted(() => ({
  person: null as null | { id: string; email: string; name: string },
  acceptance: { status: "expired" } as Record<string, unknown>,
}));

vi.mock("@/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/lib/session", () => ({ currentVerifiedPerson: async () => state.person }));
vi.mock("@/pilot/membership", () => ({ invitationAcceptanceState: async () => state.acceptance }));
vi.mock("./actions", () => ({ acceptPilotInvitation: async () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

describe("pilot invitation acceptance page", () => {
  beforeEach(() => {
    state.person = { id: "00000000-0000-4000-8000-000000000001", email: "student@example.test", name: "Student" };
    state.acceptance = { status: "expired" };
  });

  it("preserves the invitation and a safe destination through sign-in", async () => {
    state.person = null;
    await expect(AcceptPilotInvitationPage({
      searchParams: Promise.resolve({ token: "invite token", next: "/c/pinned?v=3" }),
    })).rejects.toThrow("redirect:/login?next=%2Fpilot%2Faccept%3Ftoken%3Dinvite%2Btoken%26next%3D%252Fc%252Fpinned%253Fv%253D3");
  });

  it("shows an expired state without an acceptance form", async () => {
    const html = renderToStaticMarkup(await AcceptPilotInvitationPage({
      searchParams: Promise.resolve({ token: "expired-token" }),
    }));
    expect(html).toContain("This invitation has expired");
    expect(html).not.toContain("Accept and join");
  });

  it("shows the participation notice and explicit acceptance control for a current invitation", async () => {
    state.acceptance = {
      status: "ready",
      noticeVersion: "participation-v1",
      expiresAt: new Date("2026-09-13T12:00:00.000Z"),
    };
    const html = renderToStaticMarkup(await AcceptPilotInvitationPage({
      searchParams: Promise.resolve({ token: "ready-token", next: "/ideas" }),
    }));
    expect(html).toContain("participation-v1");
    expect(html).toContain('name="acceptedNotice"');
    expect(html).toContain("Accept and join");
    expect(html).toContain('name="token" value="ready-token"');
    expect(html).toContain('name="next" value="/ideas"');
  });
});

