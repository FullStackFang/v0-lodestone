"use client";

import { useActionState } from "react";
import { acceptPilotInvitation, type AcceptanceActionState } from "./actions";

export function AcceptanceForm({ token, next }: { token: string; next: string }) {
  const [state, action, pending] = useActionState<AcceptanceActionState, FormData>(acceptPilotInvitation, {});
  return <form action={action} className="form-stack">
    <input type="hidden" name="token" value={token} />
    <input type="hidden" name="next" value={next} />
    <label className="pilot-check">
      <input type="checkbox" name="acceptedNotice" required />
      I understand the participation notice and choose to join this pilot.
    </label>
    {state.error && <p className="error" role="alert">{state.error}</p>}
    <button className="button" type="submit" disabled={pending}>{pending ? "Joining…" : "Accept and join"}</button>
  </form>;
}

