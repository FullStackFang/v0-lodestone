"use client";

import { useActionState, type ReactNode } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import styles from "./workspace.module.css";

export type ActionState = { message?: string; error?: string; href?: string };
export type FormAction = (previous: ActionState, data: FormData) => Promise<ActionState>;

export function ActionForm({ action, children, className }: { action: FormAction; children: ReactNode; className?: string }) {
  const [state, submit] = useActionState(action, {});
  return <form action={submit} className={className ?? styles.form}>
    {children}
    {state.error ? <p className={styles.error} role="alert">{state.error}</p> : null}
    {state.message ? <p className={styles.receipt} role="status">{state.message}{state.href ? <> <Link href={state.href}>Open revision</Link></> : null}</p> : null}
  </form>;
}

export function SubmitButton({ children, secondary = false, iconOnly = false, title }: { children: ReactNode; secondary?: boolean; iconOnly?: boolean; title?: string }) {
  const { pending } = useFormStatus();
  return <button className={iconOnly ? "icon-button" : `button${secondary ? " outline" : ""}`} type="submit" disabled={pending} aria-busy={pending} title={title} aria-label={iconOnly ? title : undefined}>{children}</button>;
}
