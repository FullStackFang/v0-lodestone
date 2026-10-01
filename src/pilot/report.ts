import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { componentReference } from "@/db/library-schema";
import { founderIntroductions } from "@/db/matching-schema";
import { pilotDailyActivity, pilotMeasurementConsent } from "@/db/measurement-schema";
import { pilotMembership } from "@/db/pilot-schema";
import { cardReview, cardRevision, ideaExperiment } from "@/db/review-schema";
import { ideaNeeds, resourceRecommendations } from "@/db/resource-schema";
import { assertPilotOperator, type VerifiedPilotActor } from "./membership";

const DAY_MS = 24 * 60 * 60 * 1000;
const day = (date: Date) => date.toISOString().slice(0, 10);
const inWindow = (date: Date | null, start: Date, end: Date) => Boolean(date && date >= start && date < end);

export async function pilotAggregateReport(db: Db, actor: VerifiedPilotActor, cutoff = new Date(), generatedAt = new Date()) {
  await assertPilotOperator(actor);
  if (cutoff.toISOString().slice(11) !== "00:00:00.000Z") throw new Error("Report cutoff must be UTC midnight.");
  const earlierStart = new Date(cutoff.getTime() - 14 * DAY_MS);
  const laterStart = new Date(cutoff.getTime() - 7 * DAY_MS);

  const eligibleRows = await db.select({
    personId: pilotMembership.personId,
    consentedAt: pilotMeasurementConsent.consentedAt,
  }).from(pilotMembership).innerJoin(pilotMeasurementConsent, eq(pilotMeasurementConsent.personId, pilotMembership.personId))
    .where(and(
      eq(pilotMembership.status, "active"), isNull(pilotMembership.revokedAt), eq(pilotMembership.memberKind, "participant"),
      eq(pilotMeasurementConsent.status, "consented"), isNull(pilotMeasurementConsent.withdrawnAt),
    ));
  const eligible = new Map(eligibleRows.flatMap((row) => row.consentedAt ? [[row.personId, row.consentedAt] as const] : []));
  const consentedBeforeFullWindow = new Set([...eligible].filter(([, consentedAt]) => consentedAt < earlierStart).map(([id]) => id));

  const activities = await db.select().from(pilotDailyActivity);
  const earlier = new Set(activities.filter((row) => consentedBeforeFullWindow.has(row.personId) && row.activityDate >= day(earlierStart) && row.activityDate < day(laterStart)).map((row) => row.personId));
  const later = new Set(activities.filter((row) => consentedBeforeFullWindow.has(row.personId) && row.activityDate >= day(laterStart) && row.activityDate < day(cutoff)).map((row) => row.personId));
  const numerator = [...earlier].filter((id) => later.has(id)).length;

  const [publications, reviews, introductions, experiments, references, recommendations] = await Promise.all([
    db.select({ ownerId: cardRevision.ownerId, createdAt: cardRevision.createdAt }).from(cardRevision),
    db.select({ reviewerId: cardReview.reviewerId, ownerId: cardRevision.ownerId, createdAt: cardReview.createdAt, respondedAt: cardReview.respondedAt })
      .from(cardReview).innerJoin(cardRevision, eq(cardRevision.id, cardReview.revisionId)),
    db.select().from(founderIntroductions),
    db.select({ ownerId: ideaExperiment.ownerId, status: ideaExperiment.status, updatedAt: ideaExperiment.updatedAt }).from(ideaExperiment),
    db.select({ personId: componentReference.personId, createdAt: componentReference.createdAt }).from(componentReference),
    db.select({ personId: ideaNeeds.personId, createdAt: resourceRecommendations.createdAt, outcome: resourceRecommendations.outcome, outcomeAt: resourceRecommendations.outcomeAt, readAt: resourceRecommendations.readAt })
      .from(resourceRecommendations).innerJoin(ideaNeeds, eq(ideaNeeds.id, resourceRecommendations.needId)),
  ]);
  const actorEligibleAt = (id: string, at: Date | null) => {
    const consentedAt = eligible.get(id);
    return Boolean(consentedAt && at && at >= consentedAt && at < cutoff);
  };
  const afterConsentAtGeneration = (id: string, at: Date | null) => {
    const consentedAt = eligible.get(id);
    return Boolean(consentedAt && at && at >= consentedAt && at <= generatedAt);
  };
  const peerEligibleAt = (a: string, b: string, at: Date | null) => actorEligibleAt(a, at) && actorEligibleAt(b, at);

  const eligibleReviews = reviews.filter((row) => inWindow(row.createdAt, earlierStart, cutoff) && peerEligibleAt(row.reviewerId, row.ownerId, row.createdAt));
  const eligibleResponses = reviews.filter((row) => inWindow(row.respondedAt, earlierStart, cutoff) && peerEligibleAt(row.reviewerId, row.ownerId, row.respondedAt));
  const latencyHours = eligibleResponses
    .filter((row) => peerEligibleAt(row.reviewerId, row.ownerId, row.createdAt))
    .map((row) => (row.respondedAt!.getTime() - row.createdAt.getTime()) / (60 * 60 * 1000));
  const outcomeRows = recommendations.filter((row) => {
    const consentedAt = eligible.get(row.personId);
    return Boolean(consentedAt && row.createdAt <= generatedAt && (row.createdAt >= consentedAt || (row.outcomeAt && row.outcomeAt >= consentedAt && row.outcomeAt <= generatedAt)));
  });
  const helped = outcomeRows.filter((row) => row.outcome === "helped").length;
  const notHelpful = outcomeRows.filter((row) => row.outcome === "not_helpful").length;
  const usefulnessDenominator = helped + notHelpful;

  return {
    cutoff: cutoff.toISOString(),
    generatedAt: generatedAt.toISOString(),
    eligibility: "current active consenting participants; operator and test enrollments excluded; peer metrics require both parties",
    eventWindow: [day(earlierStart), day(cutoff)] as [string, string],
    windows: { earlier: [day(earlierStart), day(laterStart)] as [string, string], later: [day(laterStart), day(cutoff)] as [string, string] },
    eligibleParticipants: eligible.size,
    returnVisit: { numerator, denominator: earlier.size, rate: earlier.size ? numerator / earlier.size : null },
    events: {
      publications: publications.filter((row) => inWindow(row.createdAt, earlierStart, cutoff) && actorEligibleAt(row.ownerId, row.createdAt)).length,
      peerReviews: eligibleReviews.length,
      authorResponses: eligibleResponses.length,
      averageResponseHours: latencyHours.length ? latencyHours.reduce((sum, value) => sum + value, 0) / latencyHours.length : null,
      introductionRequests: introductions.filter((row) => inWindow(row.requestedAt, earlierStart, cutoff) && peerEligibleAt(row.requesterId, row.recipientId, row.requestedAt)).length,
      introductionDecisions: introductions.filter((row) => inWindow(row.respondedAt ?? row.cancelledAt, earlierStart, cutoff) && peerEligibleAt(row.requesterId, row.recipientId, row.respondedAt ?? row.cancelledAt)).length,
      resourceAcknowledgements: recommendations.filter((row) => inWindow(row.readAt, earlierStart, cutoff) && actorEligibleAt(row.personId, row.readAt)).length,
    },
    currentState: {
      completeExperiments: experiments.filter((row) => row.status === "complete" && afterConsentAtGeneration(row.ownerId, row.updatedAt)).length,
      savedReferences: references.filter((row) => afterConsentAtGeneration(row.personId, row.createdAt)).length,
      resourceOutcomes: {
        helped,
        notHelpful,
        dismissed: outcomeRows.filter((row) => row.outcome === "dismissed").length,
        unanswered: outcomeRows.filter((row) => row.outcome === null).length,
        denominator: usefulnessDenominator,
        usefulnessRate: usefulnessDenominator ? helped / usefulnessDenominator : null,
      },
    },
    limitations: "Descriptive one-pilot aggregates. Current-state totals are evaluated at generation time and can change after consent withdrawal.",
  };
}
