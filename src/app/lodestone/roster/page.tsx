import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db/client";
import { requirePerson } from "@/lib/session";
import { isOperator, listPilotRoster } from "@/pilot/membership";
import { ActionForm, SubmitButton } from "@/review/ActionForm";
import { OperatorsOnly } from "../OperatorsOnly";
import { invite, renew, revoke } from "./actions";
import "../lodestone.css";

export const dynamic = "force-dynamic";

const day = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");

export default async function RosterPage() {
  const db = await getDb();
  const person = await requirePerson(db);
  if (!(await isOperator(db, person))) return <OperatorsOnly page="roster" />;
  const { invitations, memberships } = await listPilotRoster(db, { personId: person.id, email: person.email, emailVerified: true });
  const now = new Date();
  return <article>
    <header className="ls-header">
      <div>
        <p className="eyebrow">Lodestone · roster</p>
        <h1>Who is in the cohort</h1>
        <p>Invite by email; the invitation lasts fourteen days and is accepted by signing in with that address. Revoking a member takes their cards out of every list at once and deletes nothing.</p>
      </div>
      <nav className="ls-legend"><Link href="/lodestone"><ArrowLeft size={13} /> Cards</Link></nav>
    </header>

    <section className="ls-import">
      <h2>Invite</h2>
      <ActionForm action={invite} className="ls-import">
        <label>Email<input type="email" name="email" placeholder="member@example.edu" required /></label>
        <SubmitButton>Send invitation</SubmitButton>
      </ActionForm>
    </section>

    <section className="ls-section" style={{ marginTop: 32 }}>
      <h2>Members</h2>
      {memberships.length ? <div className="ls-rows">{memberships.map((m) => <div className="ls-row" key={m.personId}>
        <span className="t">{m.name} · {m.email}</span>
        {m.status === "active" ? <ActionForm action={revoke}>
          <input type="hidden" name="personId" value={m.personId} />
          <SubmitButton secondary>Revoke</SubmitButton>
        </ActionForm> : null}
        <span className="meta">{m.memberKind} · {m.status} · accepted {day(m.acceptedAt)}{m.revokedAt ? ` · revoked ${day(m.revokedAt)}` : ""}</span>
      </div>)}</div> : <div className="ls-quiet"><p>No members yet.</p><span>Invite someone above.</span></div>}
    </section>

    <section className="ls-section" style={{ marginTop: 32 }}>
      <h2>Invitations</h2>
      {invitations.length ? <div className="ls-rows">{invitations.map((i) => <div className="ls-row" key={i.id}>
        <span className="t">{i.email}</span>
        {i.status === "pending" ? <span style={{ display: "flex", gap: 8 }}>
          <ActionForm action={renew}><input type="hidden" name="email" value={i.email} /><SubmitButton secondary>Renew</SubmitButton></ActionForm>
          <ActionForm action={revoke}><input type="hidden" name="invitationId" value={i.id} /><SubmitButton secondary>Revoke</SubmitButton></ActionForm>
        </span> : null}
        <span className="meta">{i.status === "pending" && i.expiresAt <= now ? "expired" : i.status} · invited {day(i.createdAt)} · expires {day(i.expiresAt)} · email {i.deliveryStatus}{i.deliveryErrorCode ? ` (${i.deliveryErrorCode})` : ""}</span>
      </div>)}</div> : <div className="ls-quiet"><p>No invitations.</p></div>}
    </section>
  </article>;
}
