/** One card and what the network found for it. The owner gets the nine
 *  blocks, prior art, peers (members only) and their own feedback so far;
 *  another member gets a cohort card's blocks and nothing else. `PATCH`
 *  changes visibility, under the same rule as the page: publishing needs
 *  membership, going private is never refused. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { cardSummary as summary, feedbackFor } from "@/lodestone/api";
import { canView, cardBlocks, cardById, setVisibility } from "@/lodestone/cards";
import { peersFor } from "@/lodestone/peers";
import { corpusSize, priorArtFor } from "@/lodestone/priorArt";
import { searchState } from "@/lodestone/search";
import { withSentences } from "@/lodestone/sentences";
import { embed } from "@/harness/embed";
import { isActiveMember } from "@/pilot/membership";
import { IDEA_ID, fail, jsonBody, withToken } from "../../client";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ideaId: string }> };

export async function GET(request: Request, { params }: Params) {
  return withToken(request, async (db, person) => {
    const ideaId = IDEA_ID.parse((await params).ideaId);
    const found = await cardById(db, ideaId);
    if (!found || !(await canView(db, person.id, found.card))) return fail(404, "Card not found.");
    const { card, owner } = found;
    const mine = card.ownerId === person.id;
    const { blocks, segments } = cardBlocks(card.doc);
    if (!mine) return NextResponse.json({ card: summary(card), owner, blocks, segments });
    const member = await isActiveMember(db, person.id);
    const [search, priorArt, corpus, peers, feedback] = await Promise.all([
      searchState(db, ideaId, card.doc),
      priorArtFor(db, ideaId, 10).then((hits) => withSentences(db, embed, ideaId, hits)),
      corpusSize(db),
      member ? peersFor(db, ideaId, 10) : Promise.resolve([]),
      feedbackFor(db, person.id, ideaId),
    ]);
    return NextResponse.json({
      card: summary(card),
      owner,
      blocks,
      segments,
      member,
      corpus,
      search,
      priorArt,
      peers,
      feedback: feedback.map((f) => ({ kind: f.kind, targetId: f.targetId, verdict: f.verdict, at: f.updatedAt })),
    });
  });
}

const Patch = z.object({ visibility: z.enum(["private", "cohort"]) }).strict();

export async function PATCH(request: Request, { params }: Params) {
  return withToken(request, async (db, person) => {
    const ideaId = IDEA_ID.parse((await params).ideaId);
    const { visibility } = Patch.parse(await jsonBody(request));
    const card = await setVisibility(db, person.id, ideaId, visibility);
    return NextResponse.json({ card: summary(card) });
  });
}
