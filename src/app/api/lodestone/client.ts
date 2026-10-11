/** What every client route shares: the bearer token resolved to a person,
 *  JSON errors in one shape, and body parsing that says what went wrong. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, type Db } from "@/db/client";
import { personFromRequest, type TokenPerson } from "@/lodestone/api";

export const IDEA_ID = z.string().regex(/^[0-9a-f]{32}$/, "an idea id is 32 hex characters");

export function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export function describe(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join(". ");
  if (error instanceof SyntaxError) return "The body is not JSON.";
  return error instanceof Error ? error.message : "The request could not be completed.";
}

/** Run a handler as the token's person, or answer 401. Errors the handler
 *  throws become 400 with their message; "not found" becomes 404. */
export async function withToken(
  request: Request,
  handler: (db: Db, person: TokenPerson) => Promise<Response>,
): Promise<Response> {
  const db = await getDb();
  const person = await personFromRequest(db, request);
  if (!person) return fail(401, "A live API token is required: Authorization: Bearer lst_...");
  try {
    return await handler(db, person);
  } catch (error) {
    const message = describe(error);
    return fail(/not found/i.test(message) ? 404 : 400, message);
  }
}

export async function jsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) throw new Error("The body is empty.");
  return JSON.parse(text);
}
