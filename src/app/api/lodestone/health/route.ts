/** `GET /api/lodestone/health`, unauthenticated: 200 when every check holds,
 *  503 otherwise. Booleans only; no versions, counts or hostnames. */
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { health } from "@/lodestone/health";

export const dynamic = "force-dynamic";

export async function GET() {
  let body;
  try {
    body = await health(await getDb());
  } catch {
    body = { ok: false, db: false, migrations: false, embedder: Boolean(process.env.VOYAGE_API_KEY?.trim()), mail: false };
  }
  return NextResponse.json(body, { status: body.ok ? 200 : 503 });
}
