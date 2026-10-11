/** What the owner thought of a match. `POST` one verdict on one paper or
 *  peer; a second verdict on the same target replaces the first. `GET` the
 *  owner's verdicts for the card. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { FEEDBACK_KINDS, FEEDBACK_VERDICTS, feedbackFor, recordFeedback } from "@/lodestone/api";
import { IDEA_ID, jsonBody, withToken } from "../../../client";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ideaId: string }> };

const Body = z.object({
  kind: z.enum(FEEDBACK_KINDS as [string, ...string[]]),
  targetId: z.string().min(1),
  verdict: z.enum(FEEDBACK_VERDICTS as [string, ...string[]]),
  context: z.record(z.string(), z.unknown()).optional(),
}).strict();

export async function POST(request: Request, { params }: Params) {
  return withToken(request, async (db, person) => {
    const ideaId = IDEA_ID.parse((await params).ideaId);
    const body = Body.parse(await jsonBody(request));
    const row = await recordFeedback(db, person.id, {
      ideaId,
      kind: body.kind as "paper" | "peer",
      targetId: body.targetId,
      verdict: body.verdict as "useful" | "known" | "not_relevant",
      context: body.context,
    });
    return NextResponse.json({ feedback: { kind: row.kind, targetId: row.targetId, verdict: row.verdict, at: row.updatedAt } });
  });
}

export async function GET(request: Request, { params }: Params) {
  return withToken(request, async (db, person) => {
    const ideaId = IDEA_ID.parse((await params).ideaId);
    const rows = await feedbackFor(db, person.id, ideaId);
    return NextResponse.json({ feedback: rows.map((f) => ({ kind: f.kind, targetId: f.targetId, verdict: f.verdict, at: f.updatedAt })) });
  });
}
