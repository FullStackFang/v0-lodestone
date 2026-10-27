/** One paper or patent from the corpus: its abstract, provenance and a
 *  citation line, to any valid token. OpenAlex metadata is CC0 and patents
 *  are public domain, but the NeurIPS set's abstracts belong to their
 *  authors: tokens go only to the pilot until those are cleared or cut to
 *  excerpts (see `papers/search/route.ts`). Nothing here touches a card;
 *  the token keeps the abuse story the same as every other route. */
import { NextResponse } from "next/server";
import { corpusDocument } from "@/lodestone/priorArt";
import { fail, withToken } from "../../client";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ documentId: string }> };

export async function GET(request: Request, { params }: Params) {
  return withToken(request, async (db) => {
    const found = await corpusDocument(db, (await params).documentId);
    if (!found) return fail(404, "Paper not found.");
    return NextResponse.json(found);
  });
}
