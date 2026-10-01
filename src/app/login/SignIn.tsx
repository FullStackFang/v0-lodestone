"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { safeReturnPath } from "@/auth/return-path";

export function SignIn({ callbackURL = "/ideas" }: { callbackURL?: string }) {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
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
  return <form onSubmit={submit} className="form-stack">
    <label>Name<input name="name" type="text" autoComplete="name" required maxLength={120} /></label>
    <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
    <button className="button" disabled={pending}><Mail size={16} />{pending ? "Sending link..." : "Email a sign-in link"}<ArrowRight size={16} /></button>
    {sent && <p role="status">Check your email for your sign-in link.</p>}
    {error && <p role="alert" className="error">{error}</p>}
  </form>;
}
