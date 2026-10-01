import { getDb } from "@/db/client";
import { requirePerson } from "@/lib/session";
import { pilotAggregateReport } from "@/pilot/report";

export const dynamic = "force-dynamic";
const midnight = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};
const rate = (value: number | null) => value === null ? "Not available" : `${(value * 100).toFixed(0)}%`;

export default async function PilotReportPage() {
  const db = await getDb();
  const person = await requirePerson(db);
  const report = await pilotAggregateReport(db, { personId: person.id, email: person.email, emailVerified: true }, midnight());
  return <div className="pilot-workspace">
    <header className="page-heading"><div><p className="eyebrow">Aggregate · content-free</p><h1>Pilot measurement</h1></div><a className="button outline" href={`/api/pilot/report?cutoff=${report.cutoff.slice(0, 10)}`}>Export JSON</a></header>
    <section className="card form-stack">
      <p>UTC cutoff: <strong>{report.cutoff}</strong> · generated {report.generatedAt}</p>
      <p>Eligibility: {report.eligibility}</p>
      <p>Event window: [{report.eventWindow[0]}, {report.eventWindow[1]})</p>
      <h2>Two-week return</h2>
      <p>{rate(report.returnVisit.rate)} · {report.returnVisit.numerator} returned / {report.returnVisit.denominator} eligible in the earlier week</p>
      <p className="muted">Earlier [{report.windows.earlier.join(", ")}); later [{report.windows.later.join(", ")}). This is a two-week return measure, not D7 retention.</p>
    </section>
    <section className="pilot-section"><h2>Window events</h2><dl>
      <dt>Publications</dt><dd>{report.events.publications}</dd><dt>Peer reviews</dt><dd>{report.events.peerReviews}</dd>
      <dt>Author responses</dt><dd>{report.events.authorResponses}</dd><dt>Average eligible response time</dt><dd>{report.events.averageResponseHours === null ? "Not available" : `${report.events.averageResponseHours.toFixed(1)} hours`}</dd>
      <dt>Introduction requests</dt><dd>{report.events.introductionRequests}</dd><dt>Introduction decisions</dt><dd>{report.events.introductionDecisions}</dd>
      <dt>Resource acknowledgements</dt><dd>{report.events.resourceAcknowledgements} (acknowledgements, not impressions)</dd>
    </dl></section>
    <section className="pilot-section"><h2>Current state at generation time</h2><dl>
      <dt>Complete experiments</dt><dd>{report.currentState.completeExperiments}</dd><dt>Saved references</dt><dd>{report.currentState.savedReferences}</dd>
      <dt>Resource usefulness</dt><dd>{rate(report.currentState.resourceOutcomes.usefulnessRate)} · {report.currentState.resourceOutcomes.helped} helped / {report.currentState.resourceOutcomes.denominator} rated</dd>
      <dt>Dismissed</dt><dd>{report.currentState.resourceOutcomes.dismissed}</dd><dt>Unanswered</dt><dd>{report.currentState.resourceOutcomes.unanswered}</dd>
    </dl><p className="muted">{report.limitations}</p></section>
  </div>;
}
