import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { currentVerifiedPerson } from "@/lib/session";
import { pilotAggregateReport } from "@/pilot/report";

export async function GET(request: Request) {
  const db = await getDb();
  const person = await currentVerifiedPerson(db);
  if (!person) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  const value = new URL(request.url).searchParams.get("cutoff") ?? new Date().toISOString().slice(0, 10);
  const parsed = z.iso.date().safeParse(value);
  if (!parsed.success) return NextResponse.json({ error: "valid UTC cutoff required" }, { status: 400 });
  try {
    return NextResponse.json(await pilotAggregateReport(
      db,
      { personId: person.id, email: person.email, emailVerified: true },
      new Date(`${parsed.data}T00:00:00.000Z`),
    ));
  } catch {
    return NextResponse.json({ error: "pilot operator access required" }, { status: 403 });
  }
}
