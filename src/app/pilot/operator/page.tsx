import { getDb } from "@/db/client";
import { requirePerson } from "@/lib/session";
import { listPilotRoster } from "@/pilot/membership";
import {
  createAndSendInvitation,
  renewAndSendInvitation,
  revokePilotInvitation,
  revokePilotMember,
  retryGlobalRefresh,
  runGlobalRefresh,
} from "./actions";
import { PilotActionForm } from "./PilotActionForm";
import { operatorRefreshStatus } from "@/resources/refresh-runs";

export const dynamic = "force-dynamic";

export default async function PilotOperatorPage() {
  const db = await getDb();
  const person = await requirePerson(db);
  const actor = {
    personId: person.id,
    email: person.email,
    emailVerified: true,
  };
  const [roster, refresh] = await Promise.all([
    listPilotRoster(db, actor),
    operatorRefreshStatus(db, actor),
  ]);
  return <div className="pilot-workspace">
    <header className="page-heading"><div><p className="eyebrow">One deployment · one pilot</p><h1>Pilot roster</h1></div><a className="button outline" href="/pilot/operator/report">Aggregate report</a></header>
    <section className="card pilot-create">
      <h2>Invite a participant</h2>
      <PilotActionForm action={createAndSendInvitation}>
        <label>Email<input type="email" name="email" required /></label>
        <label>Participation notice version<input type="text" name="noticeVersion" defaultValue="participation-v1" required maxLength={100} /></label>
        <label>Enrollment type<select name="memberKind" defaultValue="participant"><option value="participant">Participant</option><option value="operator">Operator participant</option><option value="test">Synthetic test account</option></select></label>
        <button className="button" type="submit">Create and send invitation</button>
      </PilotActionForm>
    </section>

    <section className="pilot-section">
      <h2>Invitations</h2>
      {roster.invitations.length === 0 ? <p className="muted">No invitations yet.</p> : <div className="pilot-list">{roster.invitations.map((invitation) => {
        const expired = invitation.status === "pending" && invitation.expiresAt <= new Date();
        const delivery = invitation.deliveryStatus === "failed" ? "Delivery failed" : invitation.deliveryStatus === "sent" ? "Sent" : "Not sent";
        return <article className="card" key={invitation.id}>
          <h3>{invitation.email}</h3>
          <p>{invitation.status}{expired ? " · expired" : ""} · {delivery} · {invitation.memberKind}</p>
          <p className="muted">Notice {invitation.noticeVersion} · expires {invitation.expiresAt.toLocaleString("en-US")}</p>
          {invitation.status === "pending" && <div className="pilot-actions">
            <PilotActionForm action={renewAndSendInvitation}>
              <input type="hidden" name="email" value={invitation.email} />
              <input type="hidden" name="noticeVersion" value={invitation.noticeVersion} />
              <input type="hidden" name="memberKind" value={invitation.memberKind} />
              <button className="button outline" type="submit">Renew and resend</button>
            </PilotActionForm>
            <PilotActionForm action={revokePilotInvitation}>
              <input type="hidden" name="invitationId" value={invitation.id} />
              <button className="button outline" type="submit">Revoke invitation</button>
            </PilotActionForm>
          </div>}
        </article>;
      })}</div>}
    </section>

    <section className="pilot-section">
      <h2>Members</h2>
      {roster.memberships.length === 0 ? <p className="muted">No enrolled members yet.</p> : <div className="pilot-list">{roster.memberships.map((membership) => <article className="card" key={membership.personId}>
        <h3>{membership.name}</h3>
        <p>{membership.email} · {membership.status} · {membership.memberKind}</p>
        <p className="muted">Accepted {membership.noticeVersion} on {membership.acceptedAt.toLocaleString("en-US")}</p>
        {membership.status === "active" && <PilotActionForm action={revokePilotMember}>
          <input type="hidden" name="personId" value={membership.personId} />
          <button className="button outline" type="submit">Revoke membership</button>
        </PilotActionForm>}
      </article>)}</div>}
    </section>

    <section className="pilot-section">
      <h2>Daily resource refresh</h2>
      <p>Schedule state: <strong>{refresh.health.state.replaceAll("_", " ")}</strong></p>
      <PilotActionForm action={runGlobalRefresh}>
        <button className="button outline" type="submit">Run a new global refresh</button>
      </PilotActionForm>
      {refresh.runs.length === 0 ? <p className="muted">No global refresh has run.</p> : <div className="pilot-list">{refresh.runs.map((run) => <article className="card" key={run.id}>
        <h3>{run.trigger.replaceAll("_", " ")} · {run.status}</h3>
        <p>{run.checked} needs checked · {run.created} created · {run.updated} updated</p>
        <p className="muted">Attempt {run.attempt} · started {run.startedAt.toLocaleString("en-US")}{run.errorCode ? ` · ${run.errorCode}` : ""}</p>
        {run.trigger === "scheduled" && (run.status === "failed" || run.status === "interrupted") && run.attempt < 3 && <PilotActionForm action={retryGlobalRefresh}>
          <input type="hidden" name="runId" value={run.id} />
          <button className="button outline" type="submit">Retry scheduled slot</button>
        </PilotActionForm>}
      </article>)}</div>}
    </section>
  </div>;
}
