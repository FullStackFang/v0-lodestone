import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, type Db } from "@/db/client";
import { sameFounder } from "@/db/cards";
import { getAuth } from "@/auth/server";
import { verifiedContext } from "@/auth/identity";

async function context(db?: Db) {
  const requestHeaders = await headers();
  const d = db ?? await getDb();
  const auth = await getAuth();
  return verifiedContext(d, await auth.api.getSession({ headers: requestHeaders }));
}

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
