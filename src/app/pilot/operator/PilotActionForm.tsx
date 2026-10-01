"use client";

import { useActionState, type ReactNode } from "react";

export type PilotActionState = { error?: string; message?: string };
type Action = (state: PilotActionState, form: FormData) => Promise<PilotActionState>;

export function PilotActionForm({ action, children }: { action: Action; children: ReactNode }) {
  const [state, formAction, pending] = useActionState<PilotActionState, FormData>(action, {});
  return <form action={formAction} className="form-stack" aria-busy={pending}>
    {children}
    {state.error && <p className="error" role="alert">{state.error}</p>}
    {state.message && <p className="saved-mark" role="status">{state.message}</p>}
  </form>;
}

