import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getCard, getDocument, listStageEvents } from "@/db/cards";
import { verdicts } from "@/engine/gates";
import { standing } from "@/engine/turn";
import { ownedByPerson, sessionIdFromCookie } from "@/lib/session";
import { Thread, type ThreadTurn } from "./Thread";

export const dynamic = "force-dynamic";

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const card = await getCard(db, id);
  if (!card) notFound();
  if (!(await ownedByPerson(db, card, await sessionIdFromCookie()))) redirect("/");

  const events = await listStageEvents(db, card.id);
  const { stage, fields } = standing(card);

  // Door material becomes the first message; the thread posts it on mount.
  let pendingInput: string | null = null;
  if (events.length === 0 && card.provenance.doc_id) {
    const doc = await getDocument(db, card.provenance.doc_id);
    if (doc) pendingInput = doc.text;
  }

  const turns: ThreadTurn[] = events.map((e) => ({
    id: e.id,
    input: e.userInputRaw,
    reply: e.reply,
    stage: e.stage,
    gateResult: e.gateResult,
    failReason: e.failReason,
    fallbackUsed: e.fallbackUsed,
  }));
  const last = events.at(-1);

  return (
    <Thread
      cardId={card.id}
      slug={card.slug}
      initialTurns={turns}
      initialStage={stage}
      initialStatus={card.status}
      initialVerdicts={verdicts(fields)}
      initialQuestionsLeft={last?.questionsLeft ?? null}
      pendingInput={pendingInput}
      door={card.provenance.source}
    />
  );
}
