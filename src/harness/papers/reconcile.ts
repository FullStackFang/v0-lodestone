/** Where the reader and the extractor are compared, span against span.
 *
 * Overlap is token Jaccard over the bench's own tokenization, so
 * reconciliation and the score cannot disagree about what "the same span"
 * means.
 *
 * The asymmetry is deliberate. A human highlight that lands on a model
 * assertion supersedes it — `confirmed` is written only from a human source,
 * and `upgradeConfidence` refuses to award it, so supersession is the only
 * path. The model's credit for the find is kept on the human row in
 * `provenance.reconciled_from`, which is what lets the bench still score
 * that span as a hit for the run that produced it. A model assertion nobody
 * touched is left exactly as it was: silence in a casual session is not
 * evidence of anything. */
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  annotations,
  assertions,
  readingSessions,
  reconciliations,
  type AnnotationRow,
  type AssertionRow,
} from "@/db/schema";
import { jaccard } from "../bench/tokens";
import { getCanonicalText } from "../canonical";
import type { Relation } from "../schema";
import { tagMapping } from "./annotate";

/** Below this the model did not find the same thing; it grazed it. */
export const MATCH_THRESHOLD = 0.5;

export interface ReconciliationRow {
  annotationId: string;
  modelAssertionId: string | null;
  relation: Relation;
  overlap: number | null;
}

export interface ReconciliationSummary {
  sessionId: string;
  rows: ReconciliationRow[];
  counts: Record<Relation, number>;
}

const intersects = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  a.start < b.end && b.start < a.end;

/**
 * Compare one session's highlights with the model's assertions on the same
 * text.
 *
 * One row per annotation that files something — a `note` files nothing and
 * is Phase 3's input, and that exclusion comes from its `tag_facet_map` row
 * rather than from this file knowing the word.
 */
export async function reconcileSession(db: Db, sessionId: string): Promise<ReconciliationSummary | null> {
  const sessions = await db.select().from(readingSessions).where(eq(readingSessions.id, sessionId)).limit(1);
  const session = sessions[0];
  if (!session) return null;

  const canonical = await getCanonicalText(db, session.textHash);
  if (canonical === null) return null;

  const marks = await db.select().from(annotations).where(eq(annotations.sessionId, sessionId));
  const filing: AnnotationRow[] = [];
  for (const mark of marks) {
    const mapping = await tagMapping(db, mark.tag, mark.mechanismSubtype);
    if (mapping?.writesAssertion) filing.push(mark);
  }

  const modelRows = await db
    .select()
    .from(assertions)
    .where(
      and(
        eq(assertions.textHash, session.textHash),
        eq(assertions.status, "active"),
        isNotNull(assertions.startOff),
        // A human row is not the model's opinion of the text.
        ne(assertions.sourceType, "annotation"),
      ),
    );

  const rows: ReconciliationRow[] = [];
  const counts: Record<Relation, number> = { match: 0, boundary: 0, conflict: 0, miss: 0 };

  for (const mark of filing) {
    const human = { start: mark.startOff, end: mark.endOff };
    const touching = modelRows
      .filter((row) => intersects(human, { start: row.startOff!, end: row.endOff! }))
      .map((row) => ({ row, overlap: jaccard(canonical, human, { start: row.startOff!, end: row.endOff! }) }))
      .sort((a, b) => b.overlap - a.overlap);

    const best = touching[0];
    const facetOf = (row: AssertionRow) => row.facet;
    const humanFacet = mark.assertionId
      ? (await db.select({ facet: assertions.facet }).from(assertions).where(eq(assertions.id, mark.assertionId)))[0]
          ?.facet ?? null
      : null;

    let relation: Relation;
    let modelAssertionId: string | null = null;
    let overlap: number | null = null;
    let drift: Record<string, unknown> | null = null;

    if (!best) {
      relation = "miss";
    } else if (facetOf(best.row) !== humanFacet) {
      // Both stand. A reader resolves it on `/reconcile`; nothing here
      // picks a winner.
      relation = "conflict";
      modelAssertionId = best.row.id;
      overlap = best.overlap;
    } else if (best.overlap >= MATCH_THRESHOLD) {
      const same = best.row.startOff === mark.startOff && best.row.endOff === mark.endOff;
      relation = same ? "match" : "boundary";
      modelAssertionId = best.row.id;
      overlap = best.overlap;
      if (!same) {
        drift = {
          model_span: [best.row.startOff, best.row.endOff],
          human_span: [mark.startOff, mark.endOff],
        };
      }
      if (mark.assertionId) await adopt(db, mark.assertionId, best.row);
    } else {
      // Same facet, but it only grazed the span: the model did not find
      // this. The annotation's own assertion stands and the model row is
      // untouched — a miss has no model side, so the grazing row is kept as
      // drift rather than as a claim of a find.
      relation = "miss";
      overlap = best.overlap;
      drift = {
        grazed_model_assertion_id: best.row.id,
        model_span: [best.row.startOff, best.row.endOff],
        human_span: [mark.startOff, mark.endOff],
      };
    }

    await db.insert(reconciliations).values({
      sessionId,
      humanAnnotationId: mark.id,
      modelAssertionId,
      relation,
      overlap,
      drift,
    });
    counts[relation] += 1;
    rows.push({ annotationId: mark.id, modelAssertionId, relation, overlap });
  }

  return { sessionId, rows, counts };
}

/**
 * The human row takes the model's place.
 *
 * Not the contract's `supersede`, which inserts a replacement: the
 * replacement already exists — the reader wrote it when they saved the
 * highlight — and inserting a copy would leave two active rows saying the
 * same thing. What is needed is the end state that function produces: the
 * model row retired, pointing at the row that replaced it, and the human
 * row carrying the model's credit for the find.
 */
async function adopt(db: Db, humanAssertionId: string, model: AssertionRow): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(assertions)
      .set({
        status: "superseded",
        supersededBy: humanAssertionId,
        provenance: sql`${assertions.provenance} || ${JSON.stringify({
          superseded_reason: "reconciled",
        })}::jsonb`,
      })
      .where(and(eq(assertions.id, model.id), eq(assertions.status, "active")));

    await tx
      .update(assertions)
      .set({
        provenance: sql`${assertions.provenance} || ${JSON.stringify({
          reconciled_from: { assertion_id: model.id, extraction_run_id: model.extractionRunId },
        })}::jsonb`,
      })
      .where(eq(assertions.id, humanAssertionId));
  });
}

export interface QueueRow {
  id: string;
  relation: Relation;
  artifactId: string;
  title: string;
  humanQuote: string;
  humanSpan: [number, number];
  humanFacet: string | null;
  modelText: string | null;
  modelSpan: [number, number] | null;
  modelFacet: string | null;
  overlap: number | null;
  createdAt: Date;
}

/** Unresolved conflicts and every miss, newest first — what `/reconcile`
 *  shows. */
export async function reconciliationQueue(db: Db): Promise<QueueRow[]> {
  const rows = await db
    .select({
      row: reconciliations,
      annotation: annotations,
      artifactId: readingSessions.artifactId,
    })
    .from(reconciliations)
    .innerJoin(annotations, eq(reconciliations.humanAnnotationId, annotations.id))
    .innerJoin(readingSessions, eq(reconciliations.sessionId, readingSessions.id))
    .orderBy(sql`${reconciliations.createdAt} desc`);

  const out: QueueRow[] = [];
  for (const { row, annotation, artifactId } of rows) {
    if (row.relation === "match" || row.relation === "boundary") continue;
    if (row.relation === "conflict" && row.resolvedAt) continue;

    const model = row.modelAssertionId
      ? (await db.select().from(assertions).where(eq(assertions.id, row.modelAssertionId)))[0]
      : undefined;
    const human = annotation.assertionId
      ? (await db.select().from(assertions).where(eq(assertions.id, annotation.assertionId)))[0]
      : undefined;

    out.push({
      id: row.id,
      relation: row.relation,
      artifactId,
      title: annotation.quote.slice(0, 60),
      humanQuote: annotation.quote,
      humanSpan: [annotation.startOff, annotation.endOff],
      humanFacet: human?.facet ?? null,
      modelText: model?.text ?? null,
      modelSpan: model ? [model.startOff!, model.endOff!] : null,
      modelFacet: model?.facet ?? null,
      overlap: row.overlap,
      createdAt: row.createdAt,
    });
  }
  return out;
}

/**
 * A reader resolves a conflict by choosing which facet was right. The
 * loser is superseded by the winner; both were active until this moment.
 */
export async function resolveConflict(db: Db, reconciliationId: string, keep: "human" | "model"): Promise<void> {
  const rows = await db
    .select({ row: reconciliations, annotation: annotations })
    .from(reconciliations)
    .innerJoin(annotations, eq(reconciliations.humanAnnotationId, annotations.id))
    .where(eq(reconciliations.id, reconciliationId))
    .limit(1);
  const found = rows[0];
  if (!found || found.row.relation !== "conflict" || found.row.resolvedAt) return;

  const humanAssertionId = found.annotation.assertionId;
  const modelAssertionId = found.row.modelAssertionId;
  if (!humanAssertionId || !modelAssertionId) return;

  const winner = keep === "human" ? humanAssertionId : modelAssertionId;
  const loser = keep === "human" ? modelAssertionId : humanAssertionId;
  const [winnerRow] = await db.select().from(assertions).where(eq(assertions.id, winner));

  await db.transaction(async (tx) => {
    await tx
      .update(assertions)
      .set({
        status: "superseded",
        supersededBy: winner,
        provenance: sql`${assertions.provenance} || ${JSON.stringify({
          superseded_reason: "conflict_resolved",
        })}::jsonb`,
      })
      .where(and(eq(assertions.id, loser), eq(assertions.status, "active")));
    await tx
      .update(reconciliations)
      .set({ resolvedFacet: winnerRow?.facet ?? null, resolvedAt: new Date() })
      .where(eq(reconciliations.id, reconciliationId));
  });
}
