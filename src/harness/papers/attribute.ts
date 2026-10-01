/** Which of the reader's rows produced a result.
 *
 * The scorer reports contributors, so this is the fallback: when a
 * candidate comes back without one — an older row, or a scorer that did not
 * fill the family — the query row nearest the candidate's abstract-purpose
 * rows is looked up here, in process, over vectors already fetched.
 *
 * This is attribution, not scoring. It never adds a term, never applies λ
 * or μ, and never changes an order. */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { assertions } from "@/db/schema";
import { familyOf } from "../match/bandpass";
import type { Family } from "../schema";

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

interface Embedded {
  id: string;
  embedding: number[];
  family: Family | null;
}

async function embeddedRows(db: Db, where: ReturnType<typeof and>): Promise<Embedded[]> {
  const rows = await db
    .select({
      id: assertions.id,
      facet: assertions.facet,
      abstractionLevel: assertions.abstractionLevel,
      embedding: assertions.embedding,
    })
    .from(assertions)
    .where(and(where, eq(assertions.status, "active"), sql`${assertions.embedding} is not null`));
  return rows
    .filter((row) => row.facet && row.embedding)
    .map((row) => ({
      id: row.id,
      embedding: row.embedding!,
      family: familyOf(row.facet!, row.abstractionLevel),
    }));
}

export interface Attribution {
  queryAssertionId: string | null;
  candidateAssertionIds: string[];
}

/**
 * The query row that best matches the candidate's rows in `family`, and the
 * candidate rows that family is made of.
 *
 * Used only where the scorer reported no contributor for the family; with
 * one, the caller reads it and never comes here.
 */
export async function attribute(
  db: Db,
  query: { subjectId: string; assertionIds?: string[] },
  candidateSubjectId: string,
  family: Family = "abs",
): Promise<Attribution> {
  const queryWhere = query.assertionIds
    ? and(eq(assertions.subjectId, query.subjectId), inArray(assertions.id, query.assertionIds))
    : eq(assertions.subjectId, query.subjectId);

  const [queryRows, candidateRows] = await Promise.all([
    embeddedRows(db, queryWhere),
    embeddedRows(db, eq(assertions.subjectId, candidateSubjectId)),
  ]);

  const theirs = candidateRows.filter((row) => row.family === family);
  const candidateAssertionIds = theirs.map((row) => row.id);
  // A query-side family override means the caller scored those rows as
  // `family` whatever their facet; fall back to every query row rather
  // than to none.
  const ours = query.assertionIds ? queryRows : queryRows.filter((row) => row.family === family);
  if (ours.length === 0 || theirs.length === 0) {
    return { queryAssertionId: ours[0]?.id ?? null, candidateAssertionIds };
  }

  let best = -Infinity;
  let winner: string | null = null;
  for (const mine of ours) {
    for (const yours of theirs) {
      const similarity = cosine(mine.embedding, yours.embedding);
      if (similarity > best) {
        best = similarity;
        winner = mine.id;
      }
    }
  }
  return { queryAssertionId: winner, candidateAssertionIds };
}

/** The candidate rows that make up a family, for a judgment's
 *  `candidate_assertion_ids`. */
export async function familyRows(db: Db, subjectId: string, family: Family = "abs"): Promise<string[]> {
  const rows = await embeddedRows(db, eq(assertions.subjectId, subjectId));
  return rows.filter((row) => row.family === family).map((row) => row.id);
}
