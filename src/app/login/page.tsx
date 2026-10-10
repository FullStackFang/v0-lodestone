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
  return <section className="auth-surface">
    <h1>Lodestone</h1><p>Sign in to see your cards and the cohort.</p>
    <SignIn callbackURL={callbackURL} google={googleConfigured()} email={email} />
  </section>;
}
