import { redirect } from "next/navigation";
import { ensureSession } from "@/lib/session";
import { safeReturnPath } from "@/auth/return-path";
import { SignIn } from "./SignIn";

export const dynamic = "force-dynamic";
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const callbackURL = safeReturnPath((await searchParams).next);
  if (await ensureSession()) redirect(callbackURL);
  return <section className="auth-surface">
    <h1>Thesis Forge</h1><p>Sign in to your workspace.</p><SignIn callbackURL={callbackURL} />
  </section>;
}
