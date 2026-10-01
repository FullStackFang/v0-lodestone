"use client";

import { useActionState, type ReactNode } from "react";

export type ResourceFormState = { error?: string; message?: string };
export function ResourceForm({ action, children, className, pendingMessage = "Saving…" }: {
  action: (state: ResourceFormState, formData: FormData) => Promise<ResourceFormState>;
  children: ReactNode;
  className?: string;
  pendingMessage?: string;
}) {
  const [state, dispatch, pending] = useActionState(action, {});
  return <form action={dispatch} className={className}>
    <fieldset disabled={pending}>{children}</fieldset>
    {pending && <p role="status">{pendingMessage}</p>}
    {state.error && <p role="alert" className="resource-error">{state.error}</p>}
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}
