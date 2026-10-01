/** The algebra the co-founder query is a weighted sum over.
 *
 * Every similarity here is a mean of maxima over *assertions*. A subject is
 * never averaged into one vector: blending erases the one facet that
 * mattered, which is the finding the ledger exists to keep.
 *
 * `null` and `0` are different answers, and the difference is load-bearing.
 * A candidate with no `mechanism_commanded` rows has not scored zero on
 * coverage — coverage is unknown, and a component that is unknown
 * contributes nothing rather than dragging the sum down.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { assertions } from "@/db/schema";
import { cosine } from "./repeat";

/** What scoring needs of a row. Anything with a vector will do. */
export interface Scorable {
  id: string;
  embedding: number[] | null;
}

/** A row that might carry a commitment. */
export interface Commitment {
  provenance: unknown;
}

const embedded = <T extends Scorable>(rows: T[]): T[] => rows.filter((r) => r.embedding !== null);

/** Mean over `from` of the best cosine into `to`, and the pair that made the
 *  largest of them. One direction only. */
function meanOfMax(
  from: Scorable[],
  to: Scorable[],
): { value: number; contributor: { query: string; candidate: string } | null } {
  let total = 0;
  let best = -Infinity;
  let contributor: { query: string; candidate: string } | null = null;
  for (const a of from) {
    let max = -Infinity;
    let at: Scorable | null = null;
    for (const b of to) {
      const similarity = cosine(a.embedding!, b.embedding!);
      if (similarity > max) {
        max = similarity;
        at = b;
      }
    }
    total += max;
    if (at && max > best) {
      best = max;
      contributor = { query: a.id, candidate: at.id };
    }
  }
  return { value: total / from.length, contributor };
}

/** Symmetric facet similarity: the mean of both directions, so a founder
 *  with one purpose and one with nine are compared fairly. */
export function facetSim(a: Scorable[], b: Scorable[]): number | null {
  const left = embedded(a);
  const right = embedded(b);
  if (left.length === 0 || right.length === 0) return null;
  return (meanOfMax(left, right).value + meanOfMax(right, left).value) / 2;
}

/** Which pair of rows produced the strongest match, for the judgment to
 *  name. Null when either side is empty. */
export function topPair(a: Scorable[], b: Scorable[]) {
  const left = embedded(a);
  const right = embedded(b);
  if (left.length === 0 || right.length === 0) return null;
  return meanOfMax(left, right).contributor;
}

/** How much of what I am looking for they already command. One direction:
 *  a mechanism of theirs I never asked for is not coverage. */
export function cover(sought: Scorable[], commanded: Scorable[]): number | null {
  const left = embedded(sought);
  const right = embedded(commanded);
  if (left.length === 0 || right.length === 0) return null;
  return meanOfMax(left, right).value;
}

/** ISO `YYYY-MM` → months since year zero, for a difference that does not
 *  care about day counts. */
function months(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  return Number(m[1]) * 12 + (Number(m[2]) - 1);
}

/** The `available_from` of a person's commitment row, if they have one. */
export function availableFrom(rows: Commitment[]): string | null {
  for (const row of rows) {
    const p = row.provenance as Record<string, unknown> | null;
    if (p?.kind === "commitment" && typeof p.available_from === "string") return p.available_from;
  }
  return null;
}

/** 1 when both could start within six months of each other, 0 when they
 *  could not, null when either has not said — and null is the common case
 *  early, which is why it contributes nothing rather than zero. */
export function commitmentCompatible(a: Commitment[], b: Commitment[]): number | null {
  const one = availableFrom(a);
  const two = availableFrom(b);
  if (one === null || two === null) return null;
  const x = months(one);
  const y = months(two);
  if (x === null || y === null) return null;
  return Math.abs(x - y) <= 6 ? 1 : 0;
}

/** How much the card has moved lately: superseded rows in the window over
 *  active rows, capped at 1. A founder who rewrites everything every week
 *  is working; one whose card has not moved in a month may not be. */
export async function velocity(db: Db, cardId: string, days = 7): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [{ active }] = await db
    .select({ active: sql<number>`count(*)::int` })
    .from(assertions)
    .where(and(eq(assertions.subjectId, cardId), eq(assertions.status, "active")));
  if (!active) return 0;
  const [{ moved }] = await db
    .select({ moved: sql<number>`count(*)::int` })
    .from(assertions)
    .where(
      and(
        eq(assertions.subjectId, cardId),
        eq(assertions.status, "superseded"),
        gte(assertions.createdAt, since),
      ),
    );
  return Math.min(1, moved / active);
}
