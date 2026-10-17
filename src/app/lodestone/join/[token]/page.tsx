import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { currentVerifiedPerson } from "@/lib/session";
import { acceptInvitation, invitationAcceptanceState } from "@/pilot/membership";
import "../../lodestone.css";

export const dynamic = "force-dynamic";

/** Who to ask for a new link: the operators the deployment names. */
function operatorsLine(): string {
  const listed = (process.env.PILOT_OPERATOR_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  return listed.length ? `Ask ${listed.join(" or ")} for a new one.` : "Ask the operator who invited you for a new one.";
}

const REASONS: Record<string, (operators: string) => { title: string; body: string }> = {
  wrong_email: () => ({ title: "This invitation was sent to someone else", body: "It can only be accepted by signing in with the address it was sent to." }),
  expired: (o) => ({ title: "This invitation has expired", body: `Invitations last fourteen days. ${o}` }),
  reenrollment_required: (o) => ({ title: "This invitation has already been used", body: `It enrolled someone once and cannot enrol again. ${o}` }),
  unavailable: (o) => ({ title: "This invitation is no longer valid", body: `It was revoked or replaced by a newer one. ${o}` }),
  unverified: () => ({ title: "Sign in to accept", body: "Accepting needs a verified email address." }),
};

/** The emailed link. The addressee, signed in, is enrolled and sent to their
 *  cards; anyone else is told why not and enrolled in nothing. */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDb();
  const person = await currentVerifiedPerson(db);
  if (!person) redirect(`/login?next=${encodeURIComponent(`/lodestone/join/${token}`)}`);
  const actor = { personId: person.id, email: person.email, emailVerified: true };
  const state = await invitationAcceptanceState(db, actor, token);
  if (state.status === "ready") await acceptInvitation(db, actor, token);
  if (state.status === "ready" || state.status === "accepted") redirect("/lodestone");
  const reason = REASONS[state.status](operatorsLine());
  return <article>
    <header className="ls-header">
      <div>
        <p className="eyebrow">Lodestone · invitation</p>
        <h1>{reason.title}</h1>
        <p>{reason.body} You are signed in as {person.email}.</p>
      </div>
      <nav className="ls-legend"><Link href="/lodestone">Your cards</Link></nav>
    </header>
  </article>;
}
