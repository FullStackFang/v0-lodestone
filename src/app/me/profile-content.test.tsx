import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AssertionRow } from "@/db/schema";
import type { MeView } from "@/harness/founder/me";
import { ProfileContent, ProfileRow } from "./profile-content";
import { IntroductionStatus } from "./introduction-status";

vi.mock("./actions", () => ({
  addCommanded: async () => {}, addSought: async () => {}, answerFollowUp: async () => {},
  editAssertion: async () => {}, removeAssertion: async () => {}, updateMatchingPreferences: async () => {},
  respondToIntroduction: async () => {},
}));

const view: MeView = { personId: "person", name: "Maya", rows: [], sharedRows: [], drift: [], velocity: null,
  preferences: { discoverable: false, availability: "unavailable", intent: "cofounder" }, introductions: [], followUps: [] };

describe("founder profile UI", () => {
  it("refreshes persisted discovery controls after preferences change", () => {
    function controls(node: ReactNode): Record<string, string | null> {
      const found: Record<string, string | null> = {};
      Children.forEach(node, (child) => {
        if (!isValidElement<{ name?: string; children?: ReactNode }>(child)) return;
        if (child.props.name && ["discoverable", "availability", "intent"].includes(child.props.name)) {
          found[child.props.name] = child.key;
        }
        Object.assign(found, controls(child.props.children));
      });
      return found;
    }
    const before = controls(ProfileContent({ view }));
    const after = controls(ProfileContent({ view: { ...view, preferences: {
      discoverable: true, availability: "exploring", intent: "collaborator",
    } } }));
    for (const name of ["discoverable", "availability", "intent"]) {
      expect(before[name]).not.toBeNull();
      expect(after[name]).not.toBe(before[name]);
    }
  });

  it("starts private with explicit capability and need inputs", () => {
    const html = renderToStaticMarkup(<ProfileContent view={view} />);
    expect(html).toContain("Your profile is private.");
    expect(html).toContain('name="discoverable"');
    expect(html).not.toContain('checked=""');
    expect(html).toContain("Capability I bring");
    expect(html).toContain("Capability I am seeking");
    expect(html).toContain("No introductions yet.");
  });

  it("links idea facts to the canonical editor without profile edit controls", () => {
    const row = { id: "idea-assertion", subjectType: "idea", subjectId: "idea-id", text: "Shared purpose", confidence: "confirmed" } as AssertionRow;
    const html = renderToStaticMarkup(<ProfileRow row={row} />);
    expect(html).toContain('href="/ideas/idea-id"');
    expect(html).not.toContain('name="id"');
    expect(html).not.toContain("Save profile fact");
  });
});

const request = { row: { id: "intro", requesterId: "a", recipientId: "b", matchResultId: "m", status: "pending" as const,
  requestedAt: new Date(), respondedAt: null, cancelledAt: null, cancellationReason: null }, mine: false, otherName: "Omar", contact: null };

describe("introduction UI", () => {
  it("asks the recipient to accept or decline before showing contact details", () => {
    const html = renderToStaticMarkup(<IntroductionStatus introduction={request} />);
    expect(html).toContain('value="accepted"');
    expect(html).toContain('value="declined"');
    expect(html).not.toContain("mailto:");
  });

  it("shows a pending receipt to the requester without acceptance controls", () => {
    const html = renderToStaticMarkup(<IntroductionStatus introduction={{ ...request, mine: true }} />);
    expect(html).toContain("Request pending");
    expect(html).not.toContain('name="decision"');
    expect(html).not.toContain("mailto:");
  });

  it("renders contact links only in the accepted state", () => {
    const accepted = { ...request, row: { ...request.row, status: "accepted" as const, respondedAt: new Date() },
      contact: { name: "Omar", email: "omar@example.edu" } };
    expect(renderToStaticMarkup(<IntroductionStatus introduction={accepted} />)).toContain('href="mailto:omar@example.edu"');
    const declined = { ...request, row: { ...request.row, status: "declined" as const, respondedAt: new Date() } };
    const html = renderToStaticMarkup(<IntroductionStatus introduction={declined} />);
    expect(html).toContain("Introduction declined");
    expect(html).not.toContain("mailto:");
  });
});
