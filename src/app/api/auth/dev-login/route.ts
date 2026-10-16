import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { mailConfigured } from "@/auth/delivery";
import { safeReturnPath } from "@/auth/return-path";
import { getAuth } from "@/auth/server";

export const dynamic = "force-dynamic";

/** Development only: sign in as any address without a mailbox. The link is
 *  requested the normal way, read back from the local outbox and followed,
 *  so the session is the one a real link would have made. Gone the moment
 *  real mail is configured or the build is production. */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production" || mailConfigured()) return new NextResponse("Not found", { status: 404 });
  const url = new URL(request.url);
  const email = url.searchParams.get("email")?.trim().toLowerCase();
  if (!email) return new NextResponse("email is required", { status: 400 });
  const name = url.searchParams.get("name")?.trim() || email.split("@")[0];
  const callbackURL = safeReturnPath(url.searchParams.get("next"));
  const auth = await getAuth();
  await auth.api.signInMagicLink({ body: { email, name, callbackURL }, headers: request.headers });
  const outbox = await readFile(path.join(process.cwd(), "data", "auth", "outbox.jsonl"), "utf8");
  const line = outbox.trimEnd().split("\n").reverse().find((l) => (JSON.parse(l) as { email: string }).email === email);
  const link = line ? /https?:\/\/\S+/.exec((JSON.parse(line) as { text: string }).text)?.[0] : undefined;
  if (!link) return new NextResponse("No sign-in link reached the outbox.", { status: 500 });
  return NextResponse.redirect(link);
}
