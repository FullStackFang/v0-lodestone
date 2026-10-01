/** The card, read as assertions. No model, no cost, no drift.
 *
 * The card's fields already carry the methodology's meaning; a model
 * re-reading them would add vocabulary drift and a call per patch to a
 * mapping that is one-to-one. So the adapter is the table in `design.md` D1
 * and nothing else — `MAP` below is that table, and
 * `evals/harness/founder/canvas-fixture.json` is what proves the two agree.
 *
 * Two rules earn their keep:
 *
 *   - An enum with a free-text sibling rides in that row's
 *     `provenance.enums` rather than becoming a row of its own. "saas" has no
 *     cosine with anything; the sentence it qualifies does.
 *   - `provenance.field` — the dotted path — is the supersede key. On every
 *     patch the whole set is recomputed and compared field by field, so an
 *     unchanged field writes nothing and the drift view shows real changes
 *     rather than every turn.
 */
import { isDeepStrictEqual } from "node:util";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { assertions, thesisCard, type AssertionRow } from "@/db/schema";
import { fieldsOf } from "@/db/cards";
import {
  RUBRIC_FACTORS,
  type CardFields,
  type EvidenceType,
  type FourQuestionTest,
} from "@/schema/card";
import { embed as realEmbed } from "../embed";
import { NOT_STATED, insertAssertion, supersede, upgradeConfidence } from "../ledger";
import { FACETS, type AbstractionLevel, type Facet } from "../schema";
import { citationFor, findRepeat } from "./repeat";
import { personOf } from "./subjects";

/** One row the card implies. `subjectType` says whose it is; `applyCanvas`
 *  supplies the id, so the map itself stays a pure function of the fields. */
export interface CanvasAssertion {
  facet: Facet;
  abstractionLevel: AbstractionLevel | null;
  subjectType: "idea" | "person";
  text: string;
  evidenceType: EvidenceType | null;
  /** The dotted path from the map — this row's identity across patches. */
  field: string;
  /** Enum facets with a free-text sibling, and the odd flag that belongs to
   *  the claim rather than beside it. */
  extra?: Record<string, unknown>;
}

/** Facets a `not_stated` row is written for: every facet of the enum except
 *  the two that are only ever a person's. */
const IDEA_FACETS: Facet[] = FACETS.filter(
  (f) => f !== "mechanism_commanded" && f !== "mechanism_sought",
);

const FOUR_Q_LABELS: [keyof FourQuestionTest, string][] = [
  ["list_100_prospects", "list 100"],
  ["share_top_need", "top need"],
  ["one_gtm_reaches", "one gtm"],
  ["can_afford", "afford"],
];

const has = (s: string | null | undefined): s is string => typeof s === "string" && s.trim() !== "";

/** The whole adapter. Order is the map's order; the fixture compares as a
 *  set, so it is for readers rather than for the test. */
export function canvasAssertions(card: CardFields, personId: string | null): CanvasAssertion[] {
  const out: CanvasAssertion[] = [];
  const idea = (
    facet: Facet,
    level: AbstractionLevel | null,
    text: string,
    field: string,
    over: Partial<CanvasAssertion> = {},
  ) => out.push({ facet, abstractionLevel: level, subjectType: "idea", text, evidenceType: null, field, ...over });

  const f = card.facets;

  // --- purpose ------------------------------------------------------------
  if (has(card.idea_text)) idea("purpose", "specific", card.idea_text, "idea_text");
  if (has(card.value_proposition)) idea("purpose", "specific", card.value_proposition, "value_proposition");

  // The controlled abstract rung: a verb from a closed vocabulary and the
  // object it acts on, which is what makes two ideas comparable at all.
  if (f?.jtbd && f.jtbd.verb && has(f.jtbd.object)) {
    const context = has(f.jtbd.context) ? ` (${f.jtbd.context})` : "";
    idea("purpose", "abstract", `${f.jtbd.verb} ${f.jtbd.object}${context}`, "facets.jtbd");
  }
  if (has(card.jtbd?.job_statement)) idea("purpose", "abstract", card.jtbd!.job_statement!, "jtbd.job_statement");
  if (has(card.jtbd?.functional)) idea("purpose", "abstract", card.jtbd!.functional!, "jtbd.functional");
  if (has(card.jtbd?.emotional)) idea("purpose", "core", card.jtbd!.emotional!, "jtbd.emotional");
  if (has(card.jtbd?.social)) idea("purpose", "core", card.jtbd!.social!, "jtbd.social");

  // --- mechanism ----------------------------------------------------------
  if (has(card.offering)) {
    idea("mechanism.product", null, card.offering, "offering", {
      extra: f?.offering_type ? { enums: { offering_type: f.offering_type } } : undefined,
    });
  }
  if (f?.business_model) idea("mechanism.revenue", null, f.business_model, "facets.business_model");
  if (has(card.beachhead?.market)) {
    const why = has(card.beachhead!.why_first) ? ` — ${card.beachhead!.why_first}` : "";
    idea("mechanism.distribution", null, `${card.beachhead!.market}${why}`, "beachhead.market");
  }
  if (has(card.segment?.findability_evidence)) {
    idea("mechanism.distribution", null, card.segment!.findability_evidence!, "segment.findability_evidence");
  }

  // --- domain -------------------------------------------------------------
  if (has(card.segment?.description)) {
    const enums = Object.fromEntries(
      Object.entries({
        industry_group: f?.segment?.industry_group,
        buyer_role: f?.segment?.buyer_role,
        org_size: f?.segment?.org_size,
      }).filter(([, v]) => v != null),
    );
    idea("domain", null, card.segment!.description!, "segment.description", {
      extra: Object.keys(enums).length > 0 ? { enums } : undefined,
    });
  }
  if (has(f?.segment?.industry)) idea("domain", null, f!.segment.industry!, "facets.segment.industry");
  if (has(f?.segment?.geography)) idea("domain", null, f!.segment.geography!, "facets.segment.geography");
  for (const [at, market] of (card.beachhead?.adjacent_markets ?? []).entries()) {
    if (has(market)) idea("domain", null, market, `beachhead.adjacent_markets[${at}]`);
  }
  // `unknown` is the honest answer the schema allows; it is not a domain.
  if (has(card.economic_buyer?.role) && card.economic_buyer!.role!.trim().toLowerCase() !== "unknown") {
    idea("domain", null, `buyer: ${card.economic_buyer!.role}`, "economic_buyer.role");
  }
  if ((f?.keywords ?? []).length > 0) idea("domain", null, f!.keywords.join(", "), "facets.keywords");

  // --- constraint ---------------------------------------------------------
  if (has(card.segment?.size_estimate)) idea("constraint", null, card.segment!.size_estimate!, "segment.size_estimate");
  if (has(card.segment?.refinement)) idea("constraint", null, card.segment!.refinement!, "segment.refinement");
  if (card.economic_buyer?.distinct_from_end_user === true) {
    idea("constraint", null, "payer differs from end user", "economic_buyer.distinct_from_end_user");
  }
  if (has(card.kill_assumption?.assumption)) {
    idea("constraint", null, card.kill_assumption!.assumption!, "kill_assumption.assumption", {
      extra:
        card.kill_assumption!.falsifiable == null
          ? undefined
          : { falsifiable: card.kill_assumption!.falsifiable },
    });
  }

  // --- evaluation ---------------------------------------------------------
  if (has(card.segment?.homogeneity_claim)) {
    idea("evaluation", null, card.segment!.homogeneity_claim!, "segment.homogeneity_claim");
  }
  if (card.segment?.four_question_test) {
    const t = card.segment.four_question_test;
    const text = FOUR_Q_LABELS.map(([key, label]) => `${label}: ${t[key]}`).join("; ");
    idea("evaluation", null, text, "segment.four_question_test");
  }
  if (has(card.jtbd?.current_workaround)) {
    idea("evaluation", null, `today: ${card.jtbd!.current_workaround}`, "jtbd.current_workaround");
  }
  if (has(card.economic_buyer?.budget_evidence)) {
    idea("evaluation", null, card.economic_buyer!.budget_evidence!, "economic_buyer.budget_evidence");
  }
  if (card.four_us) {
    for (const u of ["unworkable", "unavoidable", "urgent", "underserved"] as const) {
      const answer = card.four_us[u];
      if (answer.answer == null) continue;
      idea("evaluation", null, `${u}: ${answer.answer ? "yes" : "no"} — ${answer.rationale ?? ""}`.trimEnd(), `four_us.${u}`);
    }
  }
  if (card.rubric_scores) {
    for (const factor of RUBRIC_FACTORS) {
      const s = card.rubric_scores[factor];
      // The rubric's own evidence rung rides on the row: a 5 from inference
      // and a 5 from a paying pilot are not the same claim.
      idea("evaluation", null, `${factor} ${s.score}/5 (${s.confidence}) — ${s.rationale}`, `rubric_scores.${factor}`, {
        evidenceType: s.evidence_type,
      });
    }
  }
  if (has(card.kill_assumption?.cheapest_test?.description)) {
    const t = card.kill_assumption!.cheapest_test!;
    const parts = [t.days == null ? null : `${t.days}d`, has(t.kill_criterion) ? `kill if ${t.kill_criterion}` : null]
      .filter((p): p is string => p !== null)
      .join("; ");
    idea("evaluation", null, parts ? `${t.description} (${parts})` : t.description!, "kill_assumption.cheapest_test");
  }
  if (f?.quadrant) idea("evaluation", null, f.quadrant, "facets.quadrant");

  // --- evidence: the action layer ----------------------------------------
  for (const [at, entry] of (card.evidence ?? []).entries()) {
    const source = Object.fromEntries(
      Object.entries({ source: entry.source, date: entry.date }).filter(([, v]) => v != null),
    );
    idea("evidence", null, entry.text, `evidence[${at}]`, {
      evidenceType: entry.evidence_type,
      extra: Object.keys(source).length > 0 ? source : undefined,
    });
  }

  // --- the person ---------------------------------------------------------
  // A legacy session has no person, so the card's claims about the founder
  // have no subject to belong to. Idea rows only, and nothing throws.
  if (personId !== null) {
    for (const [at, advantage] of (card.founder_context?.unfair_advantages ?? []).entries()) {
      if (!has(advantage)) continue;
      out.push({
        facet: "mechanism_commanded",
        abstractionLevel: null,
        subjectType: "person",
        text: advantage,
        // The founder's own claim about themselves, until a classmate's
        // annotation corroborates it.
        evidenceType: "stated_opinion",
        field: `founder_context.unfair_advantages[${at}]`,
      });
    }
    if (has(card.founder_context?.background)) {
      out.push({
        facet: "domain",
        abstractionLevel: null,
        subjectType: "person",
        text: card.founder_context!.background!,
        evidenceType: null,
        field: "founder_context.background",
      });
    }
  }

  // --- absence, one row per facet ----------------------------------------
  const stated = new Set(out.filter((r) => r.subjectType === "idea").map((r) => r.facet));
  // `purpose` at any level states `purpose`; any `mechanism*` subtype states
  // the bare `mechanism` a paper would use.
  if ([...stated].some((facet) => facet.startsWith("mechanism"))) stated.add("mechanism");
  for (const facet of IDEA_FACETS) {
    if (stated.has(facet)) continue;
    out.push({
      facet,
      abstractionLevel: null,
      subjectType: "idea",
      text: NOT_STATED,
      evidenceType: null,
      field: notStatedField(facet),
    });
  }

  return out;
}

/** A `not_stated` row needs a supersede key too, and it cannot be a card
 *  field — there is no field. The facet is the key. */
export function notStatedField(facet: Facet): string {
  return `not_stated:${facet}`;
}

export interface ApplyCanvasResult {
  inserted: number;
  superseded: number;
  retired: number;
  repeats: number;
}

export interface CanvasDeps {
  embed?: typeof realEmbed;
}

/**
 * Recompute the card's rows and write the difference.
 *
 * Called from `applyPatch` after the card row is written, so the ledger is
 * never ahead of the card. Idempotent: a patch that changed no mapped field
 * writes nothing at all.
 */
export async function applyCanvas(
  db: Db,
  cardId: string,
  patchEventId: string,
  deps: CanvasDeps = {},
): Promise<ApplyCanvasResult> {
  const embed = deps.embed ?? realEmbed;
  const rows = await db.select().from(thesisCard).where(eq(thesisCard.id, cardId)).limit(1);
  const card = rows[0];
  if (!card) throw new Error(`no card ${cardId}`);

  const personId = await personOf(db, cardId);
  const desired = canvasAssertions(fieldsOf(card), personId);
  const active = await db
    .select()
    .from(assertions)
    .where(
      and(
        eq(assertions.sourceType, "canvas"),
        eq(assertions.status, "active"),
        sql`${assertions.provenance} ->> 'card_id' = ${cardId}`,
      ),
    );

  const activeByField = new Map<string, AssertionRow>();
  for (const row of active) activeByField.set(String((row.provenance as Record<string, unknown>).field), row);

  const changed: { old: AssertionRow; next: CanvasAssertion }[] = [];
  const added: CanvasAssertion[] = [];
  for (const next of desired) {
    const old = activeByField.get(next.field);
    if (!old) added.push(next);
    else {
      // Claim metadata is part of the field; later ledger annotations are not.
      const oldExtra = Object.fromEntries(
        ["enums", "falsifiable", "source", "date"]
          .filter((key) => old.provenance[key] !== undefined)
          .map((key) => [key, old.provenance[key]]),
      );
      if (
        old.text !== next.text ||
        old.facet !== next.facet ||
        old.abstractionLevel !== next.abstractionLevel ||
        old.subjectType !== next.subjectType ||
        old.subjectId !== (next.subjectType === "person" ? personId : cardId) ||
        old.evidenceType !== next.evidenceType ||
        !isDeepStrictEqual(oldExtra, next.extra ?? {})
      ) changed.push({ old, next });
    }
  }
  const desiredFields = new Set(desired.map((d) => d.field));
  const removed = active.filter(
    (row) => !desiredFields.has(String((row.provenance as Record<string, unknown>).field)),
  );

  // A facet that empties and a facet that fills are the same event seen from
  // two sides: pair them so the chain reads `offering → not_stated` rather
  // than as one retirement and one unrelated insert.
  const pairs: { old: AssertionRow; next: CanvasAssertion }[] = [...changed];
  const orphans: AssertionRow[] = [];
  const remaining = [...added];
  for (const row of removed) {
    const at = remaining.findIndex((a) => a.facet === row.facet && a.subjectType === row.subjectType);
    if (at >= 0) pairs.push({ old: row, next: remaining.splice(at, 1)[0] });
    else orphans.push(row);
  }

  // One embedding request per call, and never for `not_stated`: the literal
  // string would put one identical vector into every facet.
  const fresh = [...pairs.map((p) => p.next), ...remaining].filter((r) => r.text !== NOT_STATED);
  const embedded = await embed(fresh.map((r) => r.text));
  const vectorFor = new Map<CanvasAssertion, number[] | null>();
  fresh.forEach((r, at) => vectorFor.set(r, embedded.vectors[at] ?? null));

  const result: ApplyCanvasResult = { inserted: 0, superseded: 0, retired: 0, repeats: 0 };

  for (const { old, next } of pairs) {
    const input = await rowFor(db, next, {
      cardId,
      patchEventId,
      personId,
      vector: vectorFor.get(next) ?? null,
      model: embedded.model,
      result,
    });
    await supersede(db, old.id, input);
    result.superseded += 1;
  }

  for (const next of remaining) {
    const input = await rowFor(db, next, {
      cardId,
      patchEventId,
      personId,
      vector: vectorFor.get(next) ?? null,
      model: embedded.model,
      result,
    });
    await insertAssertion(db, input);
    result.inserted += 1;
  }

  for (const row of orphans) {
    // Superseded with no successor: the field is gone, and the row stays
    // readable as history. Nothing is ever deleted.
    await db
      .update(assertions)
      .set({
        status: "superseded",
        provenance: sql`${assertions.provenance} || ${JSON.stringify({ superseded_reason: "field_cleared", patch_event_id: patchEventId })}::jsonb`,
      })
      .where(and(eq(assertions.id, row.id), eq(assertions.status, "active")));
    result.retired += 1;
  }

  return result;
}

async function rowFor(
  db: Db,
  next: CanvasAssertion,
  ctx: {
    cardId: string;
    patchEventId: string;
    personId: string | null;
    vector: number[] | null;
    model: string | null;
    result: ApplyCanvasResult;
  },
) {
  const subjectId = next.subjectType === "person" ? ctx.personId! : ctx.cardId;
  const provenance: Record<string, unknown> = {
    kind: "canvas",
    card_id: ctx.cardId,
    field: next.field,
    patch_event_id: ctx.patchEventId,
    ...(next.extra ?? {}),
  };

  // The same claim from another card of the same founder is a second source,
  // and that is the whole of `repeated`.
  if (next.text !== NOT_STATED) {
    const prior = await findRepeat(db, {
      subjectType: next.subjectType,
      subjectId,
      facet: next.facet,
      text: next.text,
      embedding: ctx.vector,
      source: { cardId: ctx.cardId, artifactId: ctx.cardId },
    });
    if (prior) {
      if (prior.confidence === "extracted") {
        await upgradeConfidence(db, prior.id, "repeated", citationFor({ cardId: ctx.cardId }));
      }
      provenance.echoes = [prior.id];
      ctx.result.repeats += 1;
    }
  }

  return {
    subjectType: next.subjectType,
    subjectId,
    facet: next.facet,
    abstractionLevel: next.abstractionLevel,
    text: next.text,
    sourceType: "canvas" as const,
    sourceArtifactId: ctx.cardId,
    provenance: provenance as never,
    evidenceType: next.evidenceType,
    embedding: ctx.vector,
    embeddingModel: ctx.vector ? ctx.model : null,
  };
}
