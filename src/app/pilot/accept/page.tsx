import { redirect } from "next/navigation";
import { safeReturnPath } from "@/auth/return-path";
import { getDb } from "@/db/client";
import { currentVerifiedPerson } from "@/lib/session";
import { invitationAcceptanceState } from "@/pilot/membership";
import { AcceptanceForm } from "./AcceptanceForm";

export const dynamic = "force-dynamic";

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function AcceptPilotInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[]; next?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = single(params.token);
  const next = safeReturnPath(single(params.next));
  const db = await getDb();
  const person = await currentVerifiedPerson(db);
  if (!person) {
    const continuation = new URLSearchParams({ token, next });
    redirect(`/login?next=${encodeURIComponent(`/pilot/accept?${continuation}`)}`);
  }
  const state = await invitationAcceptanceState(db, {
    personId: person.id,
    email: person.email,
    emailVerified: true,
  }, token);

  if (state.status === "ready") return <section className="auth-surface pilot-panel">
    <p className="eyebrow">Pilot invitation</p>
    <h1>Join the Thesis Forge pilot</h1>
    <p>This is a small, invitation-only product pilot. Your ideas remain private unless you deliberately publish them. Joining does not opt you into founder discovery or optional product measurement.</p>
    <p className="muted">Participation notice: {state.noticeVersion} · Invitation expires {state.expiresAt.toLocaleString("en-US")}.</p>
    <AcceptanceForm token={token} next={next} />
  </section>;

  const messages = {
    expired: "This invitation has expired. Ask the pilot operator for a new invitation.",
    accepted: "This invitation is already accepted and your membership is active.",
    reenrollment_required: "This invitation cannot reactivate a former membership. Ask the pilot operator for a new invitation.",
    wrong_email: "Sign in with the verified email address that received this invitation.",
    unverified: "Verify your email before accepting this invitation.",
    unavailable: "This invitation is unavailable or has been revoked.",
  } as const;
  return <section className="auth-surface pilot-panel">
    <p className="eyebrow">Pilot invitation</p>
    <h1>Invitation status</h1>
    <p>{messages[state.status]}</p>
    {state.status === "accepted" && <p><a href={next}>Continue to your workspace</a></p>}
  </section>;
}

