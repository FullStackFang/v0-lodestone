"use client";
import { LogOut } from "lucide-react";
import { useState } from "react";

export function SignOut() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  return <><button className="icon-button" title="Sign out" aria-label="Sign out" disabled={pending} onClick={async () => {
    setPending(true); setError(false);
    try {
      const result = await fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (!result.ok) throw new Error();
      window.location.assign("/login");
    } catch { setError(true); setPending(false); }
  }}><LogOut size={18} /></button>{error && <span role="alert">Sign-out failed.</span>}</>;
}
