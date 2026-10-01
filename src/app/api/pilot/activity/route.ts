import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { currentVerifiedPerson } from "@/lib/session";
import { recordPilotActivity } from "@/pilot/measurement";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "same-origin request required" }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "empty JSON object required" }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 0) {
    return NextResponse.json({ error: "activity payload must be empty" }, { status: 400 });
  }
  const db = await getDb();
  const person = await currentVerifiedPerson(db);
  if (!person) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  await recordPilotActivity(db, person.id);
  return new NextResponse(null, { status: 204 });
}
