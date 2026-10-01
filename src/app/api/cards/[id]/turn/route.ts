/** POST { input } → one turn. The response carries what the thread needs
 *  to redraw: the reply, the server's derived stage and every gate's
 *  verdict, the owner workspace and the publication preview when complete. */
import { NextResponse, after } from "next/server";
import { z } from "zod";
import { extractFromEvent } from "@/harness/founder/conversation";
import { getDb } from "@/db/client";
import { getCard } from "@/db/cards";
import { verdicts } from "@/engine/gates";
import { defaultModel } from "@/engine/models";
import { ForbiddenError, runTurn, standing } from "@/engine/turn";
import { ownedByPerson, sessionIdFromCookie } from "@/lib/session";

const Body = z.object({ input: z.string().trim().min(1).max(60_000) });

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "input required" }, { status: 400 });

  const db = await getDb();
  const sessionId = await sessionIdFromCookie();
  const card = await getCard(db, id);
  if (!card) return NextResponse.json({ error: "no such card" }, { status: 404 });
  if (!sessionId || !(await ownedByPerson(db, card, sessionId))) {
    return NextResponse.json({ error: "not your card" }, { status: 403 });
  }

  try {
    const r = await runTurn(db, {
      cardId: id,
      sessionId,
      userInput: parsed.data.input,
      model: defaultModel(),
      // The founder waits for their reply, not for the ledger.
      afterCommit: (eventId) => after(() => extractFromEvent(db, eventId)),
    });
    const { fields } = standing(r.card);
    return NextResponse.json({
      reply: r.reply,
      stage: r.stage,
      status: r.card.status,
      questionsLeft: r.questionsLeft,
      verdicts: verdicts(fields),
      event: { stage: r.event.stage, gateResult: r.event.gateResult, failReason: r.event.failReason, fallbackUsed: r.event.fallbackUsed },
      workspaceUrl: `/ideas/${r.card.id}`,
      shareUrl: r.card.status === "complete" ? `/ideas/${r.card.id}/publish` : null,
    });
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
}
