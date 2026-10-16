"use client";

import { useState, type FormEvent } from "react";
import { safeReturnPath } from "@/auth/return-path";
import { Pill } from "../lodestone/ui";

export function SignIn({ callbackURL = "/lodestone", google = false, email = true }: { callbackURL?: string; google?: boolean; email?: boolean }) {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function withGoogle() {
    setPending(true); setError("");
    try {
      const response = await fetch("/api/auth/sign-in/social", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "google", callbackURL: safeReturnPath(callbackURL) }),
      });
      const body = (await response.json()) as { url?: string };
      if (!response.ok || !body.url) throw new Error("Google sign-in could not start. Please try again.");
      window.location.assign(body.url);
    } catch (e) { setError(e instanceof Error ? e.message : "Sign-in failed."); setPending(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true); setError(""); setSent(false);
    try {
      const response = await fetch("/api/auth/sign-in/magic-link", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), name: data.get("name"), callbackURL: safeReturnPath(callbackURL) }),
      });
      if (!response.ok) throw new Error("The sign-in link could not be sent. Please try again.");
      setSent(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Sign-in failed."); }
    finally { setPending(false); }
  }

  return <div className="auth-stack">
    {google && <Pill variant="ink" arrow="right" disabled={pending} onClick={withGoogle}>{pending ? "Opening Google..." : "Continue with Google"}</Pill>}
    {google && email && <p className="quiet" style={{ textAlign: "center", margin: 0 }}>or</p>}
    {email && <form onSubmit={submit} className="field-card">
      <label>Name<input name="name" type="text" autoComplete="name" required maxLength={120} /></label>
      <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
      <Pill variant={google ? "line" : "ink"} type="submit" arrow="right" disabled={pending} className="self-start">{pending ? "Sending link..." : "Email a sign-in link"}</Pill>
      {sent && <p role="status" className="receipt">Check your email for your sign-in link.</p>}
    </form>}
    {error && <p role="alert" className="error">{error}</p>}
  </div>;
}
