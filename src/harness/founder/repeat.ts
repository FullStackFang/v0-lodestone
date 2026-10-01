/** "The founder said that again."
 *
 * One rule, two callers: the canvas adapter looks across cards, the
 * conversation adapter across turns. The part that matters is what does *not*
 * count — a second reading of the same source. Provenance decides that, not
 * the threshold, so a chatty founder cannot manufacture a rung by repeating
 * themselves inside one utterance.
 */
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { assertions, type AssertionRow } from "@/db/schema";
import { normalize } from "../canonical";
import type { Facet, SubjectType } from "../schema";

/** Cosine similarity above which two texts are the same claim in different
 *  words. Voyage 3.5; the two labeled pairs in
 *  `evals/harness/founder/repeat-fixture.json` are what set it. */
export const REPEAT_THRESHOLD = 0.92;

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Text equal once normalized is always a repeat, whatever the vectors say
 *  — and it is the only signal available with no embedding key. */
export function sameClaim(a: string, b: string, va: number[] | null, vb: number[] | null): boolean {
  if (normalize(a).toLowerCase() === normalize(b).toLowerCase()) return true;
  if (!va || !vb) return false;
  return cosine(va, vb) >= REPEAT_THRESHOLD;
}

export interface RepeatCandidate {
  subjectType: SubjectType;
  subjectId: string;
  facet: Facet;
  text: string;
  embedding: number[] | null;
  /** The source this row would be written from. A prior row from the same
   *  one is the same source said twice, which is not a repeat. */
  source: { cardId?: string; stageEventId?: string; artifactId?: string };
}

/** The active row this one repeats, or null. Same subject, same facet,
 *  different source. */
export async function findRepeat(db: Db, candidate: RepeatCandidate): Promise<AssertionRow | null> {
  const rows = await db
    .select()
    .from(assertions)
    .where(
      and(
        eq(assertions.subjectType, candidate.subjectType),
        eq(assertions.subjectId, candidate.subjectId),
        eq(assertions.facet, candidate.facet),
        eq(assertions.status, "active"),
        sql`${assertions.text} <> 'not_stated'`,
      ),
    );

  for (const row of rows) {
    if (sameSource(row, candidate.source)) continue;
    if (sameClaim(row.text, candidate.text, row.embedding, candidate.embedding)) return row;
  }
  return null;
}

function sameSource(row: AssertionRow, source: RepeatCandidate["source"]): boolean {
  const provenance = row.provenance as Record<string, unknown>;
  if (source.cardId && provenance.card_id === source.cardId) return true;
  if (source.stageEventId && provenance.stage_event_id === source.stageEventId) return true;
  if (source.artifactId && row.sourceArtifactId === source.artifactId) return true;
  return false;
}

/** What `upgradeConfidence` needs to be told: the *second* source, which is
 *  the one being written now. */
export function citationFor(source: RepeatCandidate["source"]) {
  if (source.stageEventId) return { stageEventId: source.stageEventId };
  return { sourceArtifactId: source.cardId ?? source.artifactId! };
}
