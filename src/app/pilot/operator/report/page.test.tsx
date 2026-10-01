import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PilotReportPage from "./page";

vi.mock("@/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/lib/session", () => ({ requirePerson: async () => ({ id: "operator", email: "operator@example.test" }) }));
vi.mock("@/pilot/report", () => ({ pilotAggregateReport: async () => ({
  cutoff: "2026-09-15T00:00:00.000Z", generatedAt: "2026-09-15T12:00:00.000Z",
  eligibility: "current active consenting participants; operator and test enrollments excluded; peer metrics require both parties",
  eventWindow: ["2026-09-01", "2026-09-15"], windows: { earlier: ["2026-09-01", "2026-09-08"], later: ["2026-09-08", "2026-09-15"] },
  eligibleParticipants: 0, returnVisit: { numerator: 0, denominator: 0, rate: null },
  events: { publications: 0, peerReviews: 0, authorResponses: 0, averageResponseHours: null, introductionRequests: 0, introductionDecisions: 0, resourceAcknowledgements: 0 },
  currentState: { completeExperiments: 0, savedReferences: 0, resourceOutcomes: { helped: 0, notHelpful: 0, dismissed: 0, unanswered: 0, denominator: 0, usefulnessRate: null } },
  limitations: "Descriptive aggregate.",
}) }));

describe("pilot measurement report", () => {
  it("labels cutoffs, denominators, unavailable values, acknowledgements, and mutable totals", async () => {
    const html = renderToStaticMarkup(await PilotReportPage());
    expect(html).toContain("UTC cutoff");
    expect(html).toContain("0 returned / 0 eligible");
    expect(html).toContain("Not available");
    expect(html).toContain("acknowledgements, not impressions");
    expect(html).toContain("Current state at generation time");
    expect(html).not.toContain("operator@example.test");
  });
});
