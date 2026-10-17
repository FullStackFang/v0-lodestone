import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db/client";
import { currentMembership, requirePerson } from "@/lib/session";
import { isOperator, listPilotRoster } from "@/pilot/membership";
import { ActionForm, SubmitButton } from "@/review/ActionForm";
import { OperatorsOnly } from "../OperatorsOnly";
import { Chip, SectionHead, type ChipTone } from "../ui";
import { invite, renew, revoke } from "./actions";

export const dynamic = "force-dynamic";

const day = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const TONE: Record<string, ChipTone> = { active: "lime", accepted: "lime", pending: "amber", expired: "ghost", revoked: "ox" };
const Status = ({ s }: { s: string }) => <Chip tone={TONE[s] ?? "ghost"}>{s}</Chip>;

export default async function RosterPage() {
  const db = await getDb();
  const person = await requirePerson(db);
  if (!isOperator(person, await currentMembership())) return <OperatorsOnly page="roster" />;
  const { invitations, memberships } = await listPilotRoster(db, { personId: person.id, email: person.email, emailVerified: true });
  const now = new Date();
  return <article className="wrap stack">
    <header className="mast drench">
      <Link className="back" href="/lodestone"><ArrowLeft size={14} />Cards</Link>
      <div className="mast-copy">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><Chip tone="glass">Operators only</Chip><span className="lab">Lodestone · roster</span></div>
        <h1 className="h1 title">Who is in the cohort</h1>
        <p className="line">Invite by email; the invitation lasts fourteen days and is accepted by signing in with that address. Revoking a member takes their cards out of every list at once and deletes nothing.</p>
      </div>
    </header>

    <section className="panel paper split">
      <SectionHead n="01" title="Invite" tone="var(--teal)" />
      <ActionForm action={invite} className="field-card">
        <label>Email<input type="email" name="email" placeholder="member@example.edu" required /></label>
        <SubmitButton>Send invitation</SubmitButton>
      </ActionForm>
    </section>

    <section className="panel blue split">
      <SectionHead n="02" title="Members" tone="var(--blue)" />
      <div>
        {memberships.length ? memberships.map((m, i) => <div className={[m.status === "active" ? "rk tok" : "rk tok muted", i === memberships.length - 1 ? "last" : ""].filter(Boolean).join(" ")} key={m.personId}>
          <span className="n">{i + 1}</span>
          <span className="t">{m.name}<small>{m.email} · {m.memberKind} · <Status s={m.status} /> · accepted {day(m.acceptedAt)}{m.revokedAt ? ` · revoked ${day(m.revokedAt)}` : ""}</small></span>
          {m.status === "active" ? <ActionForm action={revoke} className="rk-form">
            <input type="hidden" name="personId" value={m.personId} />
            <SubmitButton secondary>Revoke</SubmitButton>
          </ActionForm> : <span />}
        </div>) : <div className="empty"><p>No members yet.</p><span>Invite someone above.</span></div>}
      </div>
    </section>

    <section className="panel paper split">
      <SectionHead n="03" title="Invitations" tone="var(--plum)" />
      <div>
        {invitations.length ? invitations.map((i, at) => {
          const status = i.status === "pending" && i.expiresAt <= now ? "expired" : i.status;
          return <div className={[status === "pending" ? "rk tok" : "rk tok muted", at === invitations.length - 1 ? "last" : ""].filter(Boolean).join(" ")} key={i.id}>
            <span className="n">{at + 1}</span>
            <span className="t">{i.email}<small><Status s={status} /> · invited {day(i.createdAt)} · expires {day(i.expiresAt)} · email {i.deliveryStatus}{i.deliveryErrorCode ? ` (${i.deliveryErrorCode})` : ""}</small></span>
            {i.status === "pending" ? <span className="rk-form">
              <ActionForm action={renew} className="rk-form"><input type="hidden" name="email" value={i.email} /><SubmitButton secondary>Renew</SubmitButton></ActionForm>
              <ActionForm action={revoke} className="rk-form"><input type="hidden" name="invitationId" value={i.id} /><SubmitButton secondary>Revoke</SubmitButton></ActionForm>
            </span> : <span />}
          </div>;
        }) : <div className="empty"><p>No invitations.</p></div>}
      </div>
    </section>
  </article>;
}
