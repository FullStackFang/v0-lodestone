/** Prior art: who else has done *this*, in this field.
 *
 * The same scorer as the analogy query with the filter inverted — the
 * candidate must share the query artifact's OpenAlex field — and the
 * penalties the `prior_art` row of `match_params` carries, seeded at zero
 * so a shared mechanism is not held against a paper. Sharing your method is
 * the point here; it is what puts a paper on the competition slide rather
 * than the inspiration board.
 *
 * No rerank call. The card is the citation, the matched specific purpose
 * and the paper's mechanisms — a record, not a mapping. */
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { assertions } from "@/db/schema";
import type { SubjectRef } from "../match/bandpass";
import { analogies, type AnalogyResult } from "./analogy";

export async function priorArt(
  db: Db,
  query: SubjectRef,
  options: { k?: number } = {},
): Promise<AnalogyResult[]> {
  return analogies(db, query, {
    k: options.k,
    edgeType: "prior_art",
    sameField: true,
    // A constraint is a second way to describe a problem; prior art is
    // about the same problem said the same way.
    withConstraints: false,
  });
}

export interface PriorArtCard {
  subjectId: string;
  score: number;
  /** The component read as the headline for this edge. */
  similarity: number;
  matchedPurpose: string | null;
  mechanisms: string[];
  queryAssertionId: string | null;
  candidateAssertionIds: string[];
}

/** What a prior-art row renders as. The matched purpose is the candidate's
 *  own `specific` row — the sentence a reader can check against the
 *  abstract. */
export async function priorArtCards(
  db: Db,
  query: SubjectRef,
  options: { k?: number } = {},
): Promise<PriorArtCard[]> {
  const results = await priorArt(db, query, options);
  return Promise.all(
    results.map(async (result) => {
      const rows = await db
        .select({ facet: assertions.facet, text: assertions.text, level: assertions.abstractionLevel })
        .from(assertions)
        .where(and(eq(assertions.subjectId, result.subjectId), eq(assertions.status, "active")));
      const purposes = rows.filter((r) => r.facet === "purpose" && r.level === "specific");
      return {
        subjectId: result.subjectId,
        score: result.score,
        similarity: result.components.sim_spec,
        matchedPurpose: purposes[0]?.text ?? null,
        mechanisms: rows.filter((r) => r.facet?.startsWith("mechanism")).map((r) => r.text),
        queryAssertionId: result.queryAssertionId,
        candidateAssertionIds: result.candidateAssertionIds,
      };
    }),
  );
}
