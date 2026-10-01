import { getDb } from "@/db/client";
import { currentPerson, ensureSession } from "@/lib/session";
import { readPublication } from "@/review/revisions";

export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const db = await getDb();
  const sessionId = await ensureSession(db);
  const viewer = sessionId ? await currentPerson(db, sessionId) : null;
  const version = new URL(request.url).searchParams.get("v");
  const publication = await readPublication(db, slug, viewer?.id ?? null, version === null ? undefined : Number(version));
  if (!publication) return new Response("not found", { status: 404, headers: { "cache-control": "private, no-store" } });
  const { revision } = publication;
  const body = { format: "thesis-revision/1", slug, version: revision.version, created_at: revision.createdAt.toISOString(), fields: revision.fields };
  return new Response(JSON.stringify(body, null, 2) + "\n", {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store", "x-robots-tag": "noindex" },
  });
}
