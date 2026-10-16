import { redirect } from "next/navigation";
import { ensureSession } from "@/lib/session";
import { mailConfigured } from "@/auth/delivery";
import { safeReturnPath } from "@/auth/return-path";
import { googleConfigured } from "@/auth/server";
import { SignIn } from "./SignIn";

export const dynamic = "force-dynamic";
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const callbackURL = safeReturnPath((await searchParams).next);
  if (await ensureSession()) redirect(callbackURL);
  // The magic link needs somewhere to go: a provider in production, the
  // local outbox otherwise.
  const email = mailConfigured() || process.env.NODE_ENV !== "production";
  return <div className="wrap stack">
    <section className="mast drench auth-band">
      <div className="mast-copy">
        <span className="lab">Lodestone · the campus idea network</span>
        <h1 className="h1 title">Sign in to see your cards and the cohort.</h1>
        <p className="line">A card is matched to <b>prior art</b> and to <b>peers</b> before anyone else has published. Private by default; the cohort sees nine blocks and a name.</p>
      </div>
    </section>
    <section className="panel paper auth-surface">
      <SignIn callbackURL={callbackURL} google={googleConfigured()} email={email} />
    </section>
  </div>;
}
