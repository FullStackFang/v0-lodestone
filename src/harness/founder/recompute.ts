/** Recompute, as a function a script calls.
 *
 * Not a cron: a human runs it, reads the summary, and decides. The gate on
 * `competitor` and `mentor` is counted here rather than assumed, because
 * "we have a hundred judgments" is the kind of claim that should be a
 * SELECT.
 */
import { isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { judgments, session } from "@/db/schema";
import type { EdgeType } from "../schema";
import { query } from "./queries";
import { rerankAndPersist, type RerankDeps } from "./rerank";
import { COFOUNDER } from "./weights";

/** How many rows of costly signal have to exist before the other two edges
 *  are worth a founder's attention. `design.md` D6. */
export const JUDGMENT_GATE = 100;

/** How many candidates get a card. Three: a founder who acts on none of
 *  three will not act on ten. */
export const TOP_K = 3;

export interface RecomputeOptions {
  edge?: EdgeType;
  subject?: string;
  noRerank?: boolean;
  forceEdges?: boolean;
}

export interface RecomputeSummary {
  edges: Record<string, number>;
  rerankCalls: number;
  rerankCached: number;
  gateMet: boolean;
  judgments: number;
  note: string;
}

export async function enabledEdges(db: Db, options: RecomputeOptions): Promise<EdgeType[]> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(judgments);
  const gateMet = count >= JUDGMENT_GATE || options.forceEdges === true;
  const all: EdgeType[] = gateMet ? ["cofounder", "competitor", "mentor"] : ["cofounder"];
  return options.edge ? all.filter((e) => e === options.edge) : all;
}

export async function recompute(
  db: Db,
  options: RecomputeOptions = {},
  deps: RerankDeps = {},
): Promise<RecomputeSummary> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(judgments);
  const gateMet = count >= JUDGMENT_GATE || options.forceEdges === true;
  const edges = await enabledEdges(db, options);

  const people = options.subject
    ? [options.subject]
    : (
        await db
          .selectDistinct({ id: session.personId })
          .from(session)
          .where(isNotNull(session.personId))
      ).map((r) => r.id!);

  const summary: RecomputeSummary = {
    edges: {},
    rerankCalls: 0,
    rerankCached: 0,
    gateMet,
    judgments: count,
    note: gateMet
      ? "all edges enabled"
      : `gate not met — ${count} of ${JUDGMENT_GATE} judgments; only cofounder ran`,
  };

  for (const edgeType of edges) {
    let written = 0;
    for (const personId of people) {
      const { results } = await query(db, edgeType, { personId }, TOP_K, COFOUNDER);
      for (const [at, result] of results.entries()) {
        const persisted = await rerankAndPersist(
          db,
          {
            edgeType,
            querySubjectType: "person",
            querySubjectId: personId,
            result,
            rank: at,
            skipModel: options.noRerank,
          },
          deps,
        );
        written += 1;
        if (persisted.cached) summary.rerankCached += 1;
        else if (!options.noRerank) summary.rerankCalls += 1;
      }
    }
    summary.edges[edgeType] = written;
  }

  if (options.subject) summary.note += `; narrowed to one subject`;
  return summary;
}
