/** A client's cards. `POST` is the import form as an API: the body is a
 *  `forge-idea` export, whole, and the card is filed under the token's person
 *  and embedded. A card that exists is updated; someone else's idea id is
 *  refused. `GET` lists the person's own cards. */
import { NextResponse } from "next/server";
import { embed } from "@/harness/embed";
import { cardSummary as summary } from "@/lodestone/api";
import { cardsForOwner, importCard } from "@/lodestone/cards";
import { jsonBody, withToken } from "../client";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withToken(request, async (db, person) => {
    const doc = await jsonBody(request);
    const out = await importCard(db, { id: person.id, email: person.email }, doc, embed);
    return NextResponse.json(
      {
        card: summary(out.card),
        created: out.created,
        filed: out.report.written,
        superseded: out.report.superseded,
        embedded: out.embedded,
      },
      { status: out.created ? 201 : 200 },
    );
  });
}

export async function GET(request: Request) {
  return withToken(request, async (db, person) => {
    const cards = await cardsForOwner(db, person.id);
    return NextResponse.json({ cards: cards.map(summary) });
  });
}

