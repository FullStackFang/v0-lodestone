"use client";

import { useActionState, type ReactNode } from "react";
import styles from "./me.module.css";

export function ActionForm({ action, children, success = "Saved." }: {
  action: (data: FormData) => Promise<void>;
  children: ReactNode;
  success?: string;
}) {
  const [state, submit, pending] = useActionState(async (_: { error: boolean; message: string }, data: FormData) => {
    try {
      await action(data);
      return { error: false, message: success };
    } catch (error) {
      const message = error instanceof Error && !error.message.includes("query:") ? error.message : "Unable to save this change. Please try again.";
      return { error: true, message };
    }
  }, { error: false, message: "" });
  return <form action={submit} className={styles.form}>
    <fieldset disabled={pending} className={styles.controls}>{children}</fieldset>
    {pending ? <span role="status">Saving...</span> : state.message ?
      <span role={state.error ? "alert" : "status"} className={state.error ? styles.error : styles.saved}>{state.message}</span> : null}
  </form>;
}
