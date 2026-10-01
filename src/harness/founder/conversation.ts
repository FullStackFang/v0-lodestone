/** What the founder said, filed once.
 *
 * The window is the same `HISTORY_TURNS` slice the turn itself saw, so a
 * quote from two turns ago still anchors — but only assertions that land
 * **at or after the newest turn's segment** are ever written. Without that
 * rule every utterance is re-extracted in the next eleven windows and the
 * repeat detector manufactures `repeated` out of one sentence.
 *
 * The filtering happens in front of the model, not behind the ledger: the
 * adapter wraps the `structured` call the core makes and drops the rows the
 * window does not own before the core can insert them. There is no delete
 * in this file, because there is no delete.
 *
 * Nothing here can fail a turn. The contract records a `failed` run and the
 * founder's reply is unchanged.
 */
import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { assertions, extractionRuns, stageEvent, type ExtractionRunRow } from "@/db/schema";
import { HISTORY_TURNS } from "@/engine/turn";
import { putArtifactText } from "../canonical";
import { anchor } from "../extract/anchor";
import { extract, type ExtractDeps } from "../extract/core";
import { upgradeConfidence } from "../ledger";
import { structured as realStructured } from "../model";
import type { ExtractionOutput, Facet, RunStats } from "../schema";
import { citationFor, findRepeat } from "./repeat";
import { personOf } from "./subjects";

/** Turns are joined by a mark normalization does not collapse and no
 *  founder types, so a quote can never straddle one by accident. */
export const TURN_SEPARATOR = " ¶ ";

/** Facets that are always about the founder, whatever the model claimed. A
 *  price point is the idea's constraint and a visa is the person's, so
 *  `constraint` and `purpose` keep the model's choice; everything else that
 *  is not in this list is the idea's. */
const ALWAYS_PERSON: Facet[] = ["mechanism_commanded", "mechanism_sought"];
const MODEL_CHOOSES: Facet[] = ["constraint", "purpose", "evidence"];

export interface WindowText {
  text: string;
  /** Where the newest turn's segment begins, in UTF-16 code units. */
  newestAt: number;
}

/** The founder side of the window, oldest first. The advisor's replies are
 *  not the founder's assertions and never enter the text. */
export function assembleWindow(inputs: string[]): WindowText {
  const text = inputs.join(TURN_SEPARATOR);
  const newest = inputs.at(-1) ?? "";
  return { text, newestAt: Math.max(0, text.length - newest.length) };
}

/** Where the assertion would land, by the same rule the core will apply. */
function startsAt(canonical: string, quote: string, prefix: string): number | null {
  const placed = anchor(canonical, quote, prefix);
  return placed.ok ? placed.start : null;
}

/**
 * Extract from one turn's window.
 *
 * Returns the run row, or null when the event does not exist or said
 * nothing. Idempotent through the contract: one `artifact_texts` row and
 * one `ok` run per (window, prompt version, model).
 */
export async function extractFromEvent(
  db: Db,
  eventId: string,
  deps: ExtractDeps = {},
): Promise<ExtractionRunRow | null> {
  const rows = await db.select().from(stageEvent).where(eq(stageEvent.id, eventId)).limit(1);
  const event = rows[0];
  if (!event) return null;

  const thread = await db
    .select({ id: stageEvent.id, input: stageEvent.userInputRaw })
    .from(stageEvent)
    .where(eq(stageEvent.cardId, event.cardId))
    .orderBy(asc(stageEvent.createdAt));
  const at = thread.findIndex((e) => e.id === eventId);
  if (at < 0) return null;
  const window = assembleWindow(
    thread.slice(Math.max(0, at + 1 - HISTORY_TURNS), at + 1).map((e) => e.input),
  );
  if (window.text.trim() === "") return null;

  const personId = await personOf(db, event.cardId);
  const { textHash } = await putArtifactText(db, {
    artifactId: eventId,
    sourceFormat: "stage_event",
    parser: "conversation-window-v1",
    text: window.text,
  });

  const dropped = { outside_window: 0, no_person: 0 };
  const structured = windowFilter(deps.structured ?? realStructured, {
    newestAt: window.newestAt,
    hasPerson: personId !== null,
    dropped,
  });

  const run = await extract(
    db,
    {
      textHash,
      variant: "conversation",
      subjects: personId ? { idea: event.cardId, person: personId } : { idea: event.cardId },
      provenance: { kind: "conversation", stage_event_id: eventId },
      sourceType: "conversation",
      sourceArtifactId: eventId,
    },
    { ...deps, structured },
  );
  if (run.status !== "ok") return run;

  return settle(db, run, { eventId, cardId: event.cardId, personId, dropped });
}

/** A `structured` that answers with only the rows this window owns. The
 *  core never sees the others, so it never writes them. */
function windowFilter(
  inner: typeof realStructured,
  ctx: { newestAt: number; hasPerson: boolean; dropped: { outside_window: number; no_person: number } },
): typeof realStructured {
  return (async (schema, request) => {
    const result = await inner(schema, request);
    const output = result.output as ExtractionOutput;
    if (!output || !Array.isArray(output.assertions)) return result;

    // `request.prompt` is the canonical text the core passed, possibly with
    // a retry note appended; anchoring only ever matches inside the text.
    const canonical = request.prompt;
    const kept = output.assertions.filter((a) => {
      const wantsPerson = ALWAYS_PERSON.includes(a.facet) || a.subject === "person";
      if (wantsPerson && !ctx.hasPerson) {
        ctx.dropped.no_person += 1;
        return false;
      }
      const start = startsAt(canonical, a.quote, a.prefix);
      // An unanchorable quote stays in: the core counts it as `unanchored`,
      // which is a measurement this adapter must not quietly take away.
      if (start === null) return true;
      if (start < ctx.newestAt) {
        ctx.dropped.outside_window += 1;
        return false;
      }
      return true;
    });

    return { ...result, output: { ...output, assertions: kept } as typeof result.output };
  }) as typeof realStructured;
}

/** Clamp the subject, climb the ladder where the founder has said it
 *  before, and put the commitment's month on the row it belongs to. */
async function settle(
  db: Db,
  run: ExtractionRunRow,
  ctx: {
    eventId: string;
    cardId: string;
    personId: string | null;
    dropped: { outside_window: number; no_person: number };
  },
): Promise<ExtractionRunRow> {
  const written = await db.select().from(assertions).where(eq(assertions.extractionRunId, run.id));
  const stats = { ...(run.stats ?? {}) } as RunStats;
  stats.outside_window = ctx.dropped.outside_window;
  stats.no_person = ctx.dropped.no_person;
  stats.repeats = 0;

  const commitment = (
    run.derived as { commitment?: { available_from?: string | null; note?: string } } | null
  )?.commitment;

  for (const row of written) {
    const facet = row.facet as Facet;
    const subjectType = ALWAYS_PERSON.includes(facet)
      ? "person"
      : MODEL_CHOOSES.includes(facet)
        ? row.subjectType
        : "idea";
    const subjectId = subjectType === "person" ? ctx.personId! : ctx.cardId;

    const provenance = { ...(row.provenance as Record<string, unknown>) };
    let touched = false;

    if (subjectType !== row.subjectType || subjectId !== row.subjectId) {
      await db.update(assertions).set({ subjectType, subjectId }).where(eq(assertions.id, row.id));
      touched = true;
    }

    // The founder said it in another turn, or the canvas already had it:
    // that is the whole of `repeated`.
    const prior = await findRepeat(db, {
      subjectType,
      subjectId,
      facet,
      text: row.text,
      embedding: row.embedding,
      source: { stageEventId: ctx.eventId },
    });
    if (prior && prior.id !== row.id) {
      if (prior.confidence === "extracted") {
        await upgradeConfidence(db, prior.id, "repeated", citationFor({ stageEventId: ctx.eventId }));
      }
      provenance.echoes = [prior.id];
      touched = true;
      stats.repeats = (stats.repeats as number) + 1;
    }

    // The commitment's month rides on the run, not on a quote.
    if (commitment && facet === "constraint" && subjectType === "person") {
      provenance.kind = "commitment";
      provenance.available_from = commitment.available_from ?? null;
      if (commitment.note) provenance.note = commitment.note;
      touched = true;
    }

    if (touched) {
      await db.update(assertions).set({ provenance: provenance as never }).where(eq(assertions.id, row.id));
    }
  }

  const [updated] = await db
    .update(extractionRuns)
    .set({ stats })
    .where(eq(extractionRuns.id, run.id))
    .returning();
  return updated;
}
