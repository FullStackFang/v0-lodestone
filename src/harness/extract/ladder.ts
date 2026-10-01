/** The purpose ladder, as a run of its own.
 *
 * A ladder pass takes the `purpose@specific` rows a source run wrote and
 * lifts each twice. It gets its own `extraction_runs` row — `variant =
 * 'ladder'`, `prompt_version = core_version = sha256(ladder.md)` — so the
 * idempotency key covers it, editing `ladder.md` yields a new run, and the
 * new run's rungs supersede the old ones while the `specific` rows they
 * came from are untouched.
 *
 * The rungs carry no selectors: they are not in the text. They are anchored
 * by the `specific` row they were lifted from, in
 * `provenance.ladder_of`. */
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { assertions, extractionRuns, type ExtractionRunRow } from "@/db/schema";
import { embed as realEmbed } from "../embed";
import { insertAssertion } from "../ledger";
import { InvalidOutput, structured as realStructured } from "../model";
import { AbstractionLevel, type RunStats } from "../schema";
import { assembleExtractPrompt } from "./prompt";
import { claimExtractionRun, runModel, type ExtractDeps } from "./core";

export class UnknownRun extends Error {}

/** One rung per input purpose, in the order they were given. */
export const LadderOutput = z
  .object({
    rungs: z.array(
      z
        .object({
          of: z.number().int().min(0),
          abstraction_level: AbstractionLevel.exclude(["specific"]),
          text: z.string().min(1),
        })
        .loose(),
    ),
  })
  .loose();
export type LadderOutput = z.infer<typeof LadderOutput>;

function emptyStats(): RunStats {
  return { unanchored: 0, ambiguous: 0, dropped_invalid: 0, embedded: false };
}

export async function ladder(
  db: Db,
  sourceRunId: string,
  deps: ExtractDeps = {},
): Promise<ExtractionRunRow> {
  const structured = deps.structured ?? realStructured;
  const embed = deps.embed ?? realEmbed;

  const sourceRows = await db.select().from(extractionRuns).where(eq(extractionRuns.id, sourceRunId)).limit(1);
  const source = sourceRows[0];
  if (!source) throw new UnknownRun(`no extraction run ${sourceRunId}`);

  const prompt = assembleExtractPrompt("ladder");
  const key = {
    textHash: source.textHash,
    variant: "ladder",
    promptVersion: prompt.promptVersion,
    // The engine that lifts the rungs, not the source's: a model-free source
    // run (a Forge projection records `none`) would otherwise stamp a real
    // model call as `none`, and the bench could not tell engines apart.
    model: runModel(),
    attributionKey: source.id,
  };

  const specifics = await db
    .select()
    .from(assertions)
    .where(
      and(
        eq(assertions.extractionRunId, sourceRunId),
        eq(assertions.facet, "purpose"),
        eq(assertions.abstractionLevel, "specific"),
        eq(assertions.status, "active"),
      ),
    );

  const claim = await claimExtractionRun(db, key, prompt.coreVersion);
  if (claim.cached) return claim.run;
  const run = claim.run;

  try {
    if (specifics.length === 0) {
      const [empty] = await db
        .update(extractionRuns)
        .set({ status: "ok", stats: { ...emptyStats(), embedded: true }, finishedAt: new Date() })
        .where(eq(extractionRuns.id, run.id))
        .returning();
      return empty;
    }

    const listing = specifics.map((row, at) => `${at}. ${row.text}`).join("\n");
    let response: Awaited<ReturnType<typeof structured<LadderOutput>>> | undefined;
    let issues = "";
    for (let attempt = 0; attempt < 2 && !response; attempt++) {
      const userPrompt =
        attempt === 0
          ? `Purposes, at their most specific:\n\n${listing}`
          : `Purposes, at their most specific:\n\n${listing}\n\nYour previous reply did not validate:\n${issues}\nReply again, valid this time.`;
      try {
        response = await structured(LadderOutput, { system: prompt.system, prompt: userPrompt });
      } catch (err) {
        if (!(err instanceof InvalidOutput)) throw err;
        issues = err.issues;
        if (attempt === 1) throw new Error("invalid_output");
      }
    }
    if (!response) throw new Error("invalid_output");

    const rungs = response.output.rungs.filter((r) => r.of < specifics.length);
    const embedded = await embed(
      rungs.map((r) => r.text),
      "document",
    );

    const stats = emptyStats();
    stats.embedded = embedded.embedded;
    stats.dropped_invalid = response.output.rungs.length - rungs.length;
    stats.purpose = {
      count: rungs.length,
      distinct: new Set(rungs.map((r) => r.text.toLowerCase())).size,
      mean_len: rungs.length === 0 ? 0 : rungs.reduce((n, r) => n + r.text.length, 0) / rungs.length,
      not_stated: 0,
    };

    return await db.transaction(async (tx) => {
      for (const [at, rung] of rungs.entries()) {
        const of = specifics[rung.of];
        const vector = embedded.vectors[at] ?? null;
        const inserted = await insertAssertion(tx as unknown as Db, {
          subjectType: of.subjectType,
          subjectId: of.subjectId,
          facet: "purpose",
          abstractionLevel: rung.abstraction_level,
          text: rung.text,
          sourceType: of.sourceType,
          sourceArtifactId: of.sourceArtifactId,
          provenance: { kind: "ladder", ladder_of: of.id },
          extractionRunId: run.id,
          embedding: vector,
          embeddingModel: vector ? embedded.model : null,
        });
        // An earlier ladder over the same `specific` row is now history —
        // the same rung, from the same source, but not the row just written.
        await tx
          .update(assertions)
          .set({ status: "superseded", supersededBy: inserted.id })
          .where(
            and(
              eq(assertions.abstractionLevel, rung.abstraction_level),
              eq(assertions.status, "active"),
              ne(assertions.id, inserted.id),
              sql`${assertions.provenance} ->> 'ladder_of' = ${of.id}`,
            ),
          );
      }
      const [updated] = await tx
        .update(extractionRuns)
        .set({ status: "ok", stats, usage: response!.usage, finishedAt: new Date() })
        .where(eq(extractionRuns.id, run.id))
        .returning();
      return updated;
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const [failed] = await db
      .update(extractionRuns)
      .set({ status: "failed", error: message.slice(0, 1000), finishedAt: new Date() })
      .where(eq(extractionRuns.id, run.id))
      .returning();
    return failed;
  }
}
