import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, type Db } from "@/db/client";
import { sameFounder } from "@/db/cards";
import { getAuth } from "@/auth/server";
import { verifiedContext } from "@/auth/identity";
import { membershipFor } from "@/pilot/membership";

/** The signed-in context, resolved once per server request however many
 *  layouts and pages ask (React `cache`; outside a render there is no memo
 *  and every call resolves). There is one database handle, so the memo is
 *  not keyed by it. */
const resolve = cache(async () => {
  const requestHeaders = await headers();
  const db = await getDb();
  const auth = await getAuth();
  return verifiedContext(db, await auth.api.getSession({ headers: requestHeaders }));
});

// `db` stays for the call sites; `getDb()` is the only handle there is.
async function context(_db?: Db) {
  return resolve();
}

/** The signed-in person's membership row, once per request; null signed out
 *  or never enrolled. Membership writers read `@/pilot/membership` directly. */
export const currentMembership = cache(async () => {
  const current = await resolve();
  return current ? membershipFor(await getDb(), current.person.id) : null;
});

export async function sessionIdFromCookie(): Promise<string | null> {
  return (await context())?.sessionId ?? null;
}

export async function ensureSession(db?: Db): Promise<string | null> {
  return (await context(db))?.sessionId ?? null;
}

export async function currentVerifiedPerson(db?: Db) {
  return (await context(db))?.person ?? null;
}

export class NoSessionError extends Error {}

export async function requireSession(db?: Db): Promise<string> {
  const id = await ensureSession(db);
  if (!id) throw new NoSessionError("Sign in to continue.");
  return id;
}

export async function requirePerson(db?: Db) {
  const current = await context(db);
  if (!current) redirect("/login");
  return current.person;
}

export function ownedBy(row: { sessionId: string }, sessionId: string | null): boolean {
  return sessionId !== null && row.sessionId === sessionId;
}

export async function currentPerson(db: Db, sessionId: string) {
  const current = await context(db);
  return current?.sessionId === sessionId ? current.person : null;
}

export async function ownedByPerson(db: Db, row: { sessionId: string }, sessionId: string | null): Promise<boolean> {
  return sessionId !== null && (await currentPerson(db, sessionId)) !== null && sameFounder(db, row.sessionId, sessionId);
}
