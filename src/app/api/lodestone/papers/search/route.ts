/** The stored papers nearest a research question, as an API: the same
 *  `searchPapers` and `mergeHits` that `lodestone:search` runs, so a hit
 *  means the same thing from either. `q` is one question or up to four
 *  sub-claims of one, each searched for `k` and merged, each paper once at
 *  its best similarity. `openalex: true` adds live OpenAlex works by W-id,
 *  writing nothing, and `openalex.stopped` lists each question it stopped on.
 *
 *  The corpus belongs to no one, so hits are not filtered by the token's
 *  person; the token gates the route as it gates the paper read.
 *
 *  Licensing gate: abstracts are returned in full, and the NeurIPS set's
 *  abstracts (`neurips-2021-2026`) belong to their authors. No key goes to
 *  anyone outside the pilot until those abstracts are cleared for that use
 *  or cut to title, link, metrics and a short excerpt for that set. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { embed } from "@/harness/embed";
import { openalexSemanticLimiter } from "@/harness/papers/rate";
import { mergeHits, openalexHits, searchPapers } from "@/harness/research/search";
import type { Embedder } from "@/lodestone/cards";
import { describe, fail, jsonBody, withToken } from "../../client";

export const dynamic = "force-dynamic";
/** Up to four questions, each a Voyage call with retries and a 20 s timeout,
 *  plus the OpenAlex limiter's waits. */
export const maxDuration = 300;

const Body = z.object({
  q: z.preprocess((value) => (typeof value === "string" ? [value] : value), z.array(z.string().trim().min(1).max(2000)).min(1).max(4)),
  k: z.number().int().min(1).max(50).default(30),
  set: z.string().min(1).optional(),
  openalex: z.boolean().default(false),
});

/** The question could not be embedded: the server's fault, never the
 *  client's, so it stays out of `withToken`'s 400. */
class EmbedFault extends Error {
  constructor(readonly status: 502 | 503, message: string) {
    super(message);
  }
}

const embedOrFault: Embedder = async (texts, inputType) => {
  let result;
  try {
    result = await embed(texts, inputType);
  } catch (error) {
    throw new EmbedFault(502, describe(error));
  }
  if (!result.embedded) throw new EmbedFault(503, "VOYAGE_API_KEY is not set: the question cannot be embedded, so nothing can be searched.");
  return result;
};

export async function POST(request: Request) {
  return withToken(request, async (db) => {
    const { q, k, set, openalex } = Body.parse(await jsonBody(request));
    // OpenAlex semantic search allows one request a second across the request.
    const wait = openalexSemanticLimiter();
    try {
      const [stored, live] = await Promise.all([
        Promise.all(q.map((question) => searchPapers(db, embedOrFault, { q: question, k, set: set ?? null }))),
        openalex ? Promise.all(q.map((question) => openalexHits(question, k, { wait }))) : null,
      ]);
      return NextResponse.json({
        hits: mergeHits([...stored, ...(live ?? []).map((l) => l.hits)]),
        openalex: live && { stopped: live.flatMap((l) => (l.stopped ? [l.stopped] : [])) },
      });
    } catch (error) {
      if (error instanceof EmbedFault) return fail(error.status, error.message);
      throw error;
    }
  });
}
