/** The weekly digest as a cron. Vercel calls it on the schedule in
 *  `vercel.json` with `Authorization: Bearer $CRON_SECRET`; anything else
 *  gets 401 and no work. Links in the mail point at `BETTER_AUTH_URL`. */
import { NextResponse } from "next/server";
import { mailConfigured } from "@/auth/delivery";
import { getDb } from "@/db/client";
import { sendDigests } from "@/lodestone/deliver";

export const dynamic = "force-dynamic";
// One digest per owner, mailed one at a time; the platform default is not
// the bound to rely on as the cohort grows.
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!mailConfigured()) return NextResponse.json({ skipped: "no mail provider configured" });
  const origin = process.env.BETTER_AUTH_URL?.replace(/\/$/, "") || new URL(request.url).origin;
  const report = await sendDigests(await getDb(), { origin });
  return NextResponse.json({ since: report.since.toISOString(), sent: report.sent.length });
}
