/** The extraction core: assembly, model call, anchoring, bookkeeping — and
 *  nothing about wording. The prompt text is the variable the autoresearch
 *  loop edits; this is the fixed instrument that scores it.
 *
 *  The run row is claimed `pending` *before* the model is called, so a
 *  concurrent callers share the same extraction. A forced attempt can
 *  recover a pending run left by a terminated process.
 *
 *  Nothing here throws for a model failure. A timeout, a refusal, output
 *  that will not validate twice, a missing engine — each is a `failed` run
 *  row the caller receives. A missing text hash or an unknown variant is a
 *  programming error and still throws. */
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { artifactTexts, assertions, extractionRuns, type ExtractionRunRow } from "@/db/schema";
import { DEFAULT_MODEL } from "@/engine/turn";
import { engineKind } from "@/engine/models";
import { getCanonicalText, normalize } from "../canonical";
import { embed as realEmbed } from "../embed";
import { NOT_STATED, insertAssertion } from "../ledger";
import { InvalidOutput, structured as realStructured } from "../model";
import {
  ExtractionOutput,
  type Facet,
  type FacetStats,
  type Provenance,
  type RunStats,
  type SubjectType,
} from "../schema";
import { anchor } from "./anchor";
import { assembleExtractPrompt } from "./prompt";

/** The caller named a text hash no `artifact_texts` row carries. */
export class UnknownText extends Error {}

export interface ExtractInput {
  textHash: string;
  variant: string;
  /** Which subject id each `subject` value in the output belongs to. An
   *  output row whose subject has no id here is dropped as invalid. */
  subjects: Partial<Record<SubjectType, string>>;
  /** Extra keys merged into every assertion's provenance. */
  provenance?: Provenance;
  sourceType?:
    | "abstract"
    | "deck"
    | "resume"
    | "canvas"
    | "jtbd"
    | "conversation"
    | "annotation"
    | "subject_edit";
  sourceArtifactId?: string | null;
  /** Re-run at the next attempt rather than returning the cached run. */
  force?: boolean;
}

export interface ExtractDeps {
  structured?: typeof realStructured;
  embed?: typeof realEmbed;
}

/** What the run key records. The engine is part of it: the same model name
 *  through the CLI and through the API is the same experiment only by
 *  coincidence, and the bench has to be able to tell them apart. */
export function runModel(): string {
  return `${engineKind()}:${process.env.THESIS_MODEL || DEFAULT_MODEL}`;
}

function emptyStats(): RunStats {
  return { unanchored: 0, ambiguous: 0, dropped_invalid: 0, embedded: false };
}

function sumUsage(a: Record<string, unknown> | null, b: Record<string, unknown> | null) {
  if (!a) return b;
  if (!b) return a;
  const out: Record<string, unknown> = { ...a };
  for (const [key, value] of Object.entries(b)) {
    const prior = out[key];
    out[key] = typeof value === "number" && typeof prior === "number" ? prior + value : value;
  }
  return out;
}

type RunKey = Pick<ExtractionRunRow, "textHash" | "variant" | "promptVersion" | "model" | "attributionKey">;

function attributionKey(input: ExtractInput): string {
  const attribution = {
    subjects: input.subjects,
    // Unqualified absence rows belong to the first declared subject.
    notStatedSubject: Object.keys(input.subjects)[0] ?? "idea",
    sourceType: input.sourceType ?? "abstract",
    sourceArtifactId: input.sourceArtifactId ?? null,
    provenance: input.provenance ?? { kind: "document", document_id: input.textHash },
  };
  const serialized = JSON.stringify(attribution, (_key, value: unknown) =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
      : value,
  );
  return createHash("sha256").update(serialized).digest("hex");
}

/** The newest `ok` or `pending` run for the key. A `failed` row is never a cache
 *  hit: the next call retries it at a new attempt without `force`. */
async function cachedRun(
  db: Db,
  key: RunKey,
): Promise<ExtractionRunRow | null> {
  const rows = await db
    .select()
    .from(extractionRuns)
    .where(
      and(
        eq(extractionRuns.textHash, key.textHash),
        eq(extractionRuns.variant, key.variant),
        eq(extractionRuns.promptVersion, key.promptVersion),
        eq(extractionRuns.model, key.model),
        eq(extractionRuns.attributionKey, key.attributionKey),
        inArray(extractionRuns.status, ["ok", "pending"]),
      ),
    )
    .orderBy(desc(extractionRuns.attempt))
    .limit(1);
  return rows[0] ?? null;
}

async function nextAttempt(
  db: Db,
  key: RunKey,
): Promise<number> {
  const rows = await db
    .select({ attempt: extractionRuns.attempt })
    .from(extractionRuns)
    .where(
      and(
        eq(extractionRuns.textHash, key.textHash),
        eq(extractionRuns.variant, key.variant),
        eq(extractionRuns.promptVersion, key.promptVersion),
        eq(extractionRuns.model, key.model),
        eq(extractionRuns.attributionKey, key.attributionKey),
      ),
    )
    .orderBy(desc(extractionRuns.attempt))
    .limit(1);
  return (rows[0]?.attempt ?? 0) + 1;
}

/** Share scoped attempt claiming with derived passes without holding a model-call lock. */
export async function claimExtractionRun(db: Db, key: RunKey, coreVersion: string, force = false) {
  return db.transaction(async (tx) => {
    await tx.select({ id: artifactTexts.id }).from(artifactTexts)
      .where(eq(artifactTexts.textHash, key.textHash)).for("update");
    if (!force) {
      const cached = await cachedRun(tx, key);
      if (cached) return { run: cached, cached: true };
    }
    const attempt = await nextAttempt(tx, key);
    const [run] = await tx.insert(extractionRuns)
      .values({ ...key, coreVersion, attempt, status: "pending" })
      .returning();
    return { run, cached: false };
  });
}

/** Embed a finished run's rows and flip `stats.embedded`. Used both after a
 *  fresh extraction and on a cache hit whose run was written key-free.
 *
 *  A row marked `provenance.free_endpoint` is a question, not a claim, and is
 *  never embedded — a vector for it would pollute max-cosine the way one for
 *  `not_stated` would. */
export async function embedRun(db: Db, run: ExtractionRunRow, embed: typeof realEmbed): Promise<ExtractionRunRow> {
  const rows = await db
    .select({ id: assertions.id, text: assertions.text })
    .from(assertions)
    .where(
      and(
        eq(assertions.extractionRunId, run.id),
        isNull(assertions.embedding),
        sql`coalesce(${assertions.provenance} ->> 'free_endpoint', 'false') <> 'true'`,
      ),
    );
  const embeddable = rows.filter((r) => r.text !== NOT_STATED);
  if (embeddable.length === 0) return run;

  const result = await embed(
    embeddable.map((r) => r.text),
    "document",
  );
  if (!result.embedded) return run;

  await db.transaction(async (tx) => {
    for (const [at, row] of embeddable.entries()) {
      const vector = result.vectors[at];
      if (!vector) continue;
      await tx
        .update(assertions)
        .set({ embedding: vector, embeddingModel: result.model })
        .where(eq(assertions.id, row.id));
    }
  });

  const stats = { ...((run.stats ?? emptyStats()) as RunStats), embedded: true };
  const usage = sumUsage(run.usage ?? null, { embedding_tokens: result.tokens ?? 0 });
  const [updated] = await db
    .update(extractionRuns)
    .set({ stats, usage })
    .where(eq(extractionRuns.id, run.id))
    .returning();
  return updated;
}

/**
 * Extract from one canonical text with one prompt variant.
 *
 * Returns the `extraction_runs` row — `ok` with its assertions written, or
 * `failed` with the reason. Idempotent on
 * `(text_hash, variant, prompt_version, model, attribution_key)`; `force` makes a new
 * attempt beside the old one rather than replacing it.
 */
export async function extract(
  db: Db,
  input: ExtractInput,
  deps: ExtractDeps = {},
): Promise<ExtractionRunRow> {
  const structured = deps.structured ?? realStructured;
  const embed = deps.embed ?? realEmbed;

  const canonical = await getCanonicalText(db, input.textHash);
  if (canonical === null) throw new UnknownText(`no artifact_texts row for ${input.textHash}`);

  // Throws for an unknown variant, before anything is claimed.
  const prompt = assembleExtractPrompt(input.variant);
  const model = runModel();
  const key = {
    textHash: input.textHash,
    variant: input.variant,
    promptVersion: prompt.promptVersion,
    model,
    attributionKey: attributionKey(input),
  };

  const claim = await claimExtractionRun(db, key, prompt.coreVersion, input.force);
  const run = claim.run;
  if (claim.cached) {
    const stats = (run.stats ?? emptyStats()) as RunStats;
    return run.status === "pending" || stats.embedded ? run : embedRun(db, run, embed);
  }

  try {
    return await runExtraction(db, { input, run, prompt, canonical, structured, embed });
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

async function runExtraction(
  db: Db,
  ctx: {
    input: ExtractInput;
    run: ExtractionRunRow;
    prompt: ReturnType<typeof assembleExtractPrompt>;
    canonical: string;
    structured: typeof realStructured;
    embed: typeof realEmbed;
  },
): Promise<ExtractionRunRow> {
  const { input, run, prompt, canonical, structured, embed } = ctx;

  // One retry on a schema miss, with the issues appended — the same shape
  // `runTurn` uses. A second failure is `invalid_output`.
  let response: Awaited<ReturnType<typeof structured<ExtractionOutput>>> | undefined;
  let usage: Record<string, unknown> | null = null;
  let issues = "";
  for (let attempt = 0; attempt < 2 && !response; attempt++) {
    const userPrompt =
      attempt === 0
        ? canonical
        : `${canonical}\n\nYour previous reply did not validate:\n${issues}\nReply again, valid this time.`;
    try {
      response = await structured(ExtractionOutput, { system: prompt.system, prompt: userPrompt });
      usage = sumUsage(usage, response.usage);
    } catch (err) {
      if (!(err instanceof InvalidOutput)) throw err;
      issues = err.issues;
      usage = sumUsage(usage, null);
      if (attempt === 1) throw new Error("invalid_output");
    }
  }
  if (!response) throw new Error("invalid_output");

  const stats = emptyStats();
  const byFacet = new Map<Facet, { texts: string[]; notStated: boolean }>();
  const bump = (facet: Facet) => {
    let entry = byFacet.get(facet);
    if (!entry) byFacet.set(facet, (entry = { texts: [], notStated: false }));
    return entry;
  };

  interface Pending {
    facet: Facet;
    subjectType: SubjectType;
    subjectId: string;
    text: string;
    abstractionLevel: "specific" | "abstract" | "core" | null;
    evidenceType: "observed_behavior" | "incurred_cost" | "stated_opinion" | "model_inference" | null;
    selectors: { startOff: number; endOff: number; quote: string } | null;
    reason?: string | null;
  }

  const pending: Pending[] = [];

  for (const row of response.output.assertions) {
    const subjectId = input.subjects[row.subject];
    if (!subjectId) {
      stats.dropped_invalid += 1;
      continue;
    }
    const placed = anchor(canonical, row.quote, row.prefix);
    if (!placed.ok) {
      stats[placed.reason] += 1;
      continue;
    }
    pending.push({
      facet: row.facet,
      subjectType: row.subject,
      subjectId,
      text: row.text,
      abstractionLevel: row.abstraction_level ?? "specific",
      evidenceType: row.evidence_type ?? null,
      selectors: { startOff: placed.start, endOff: placed.end, quote: canonical.slice(placed.start, placed.end) },
      reason: row.reason,
    });
    bump(row.facet).texts.push(row.text);
  }

  for (const facet of response.output.not_stated) {
    bump(facet).notStated = true;
    pending.push({
      facet,
      subjectType: (Object.keys(input.subjects)[0] ?? "idea") as SubjectType,
      subjectId: Object.values(input.subjects)[0]!,
      text: NOT_STATED,
      abstractionLevel: null,
      evidenceType: null,
      selectors: null,
    });
  }

  // Embed before the transaction: the provider is a network call and a
  // transaction held open across it is a lock held across it.
  const embeddable = pending.filter((p) => p.text !== NOT_STATED);
  const embedded = await ctx.embed(
    embeddable.map((p) => p.text),
    "document",
  );
  stats.embedded = embedded.embedded;
  const vectorFor = new Map<Pending, number[] | null>();
  embeddable.forEach((p, at) => vectorFor.set(p, embedded.vectors[at] ?? null));

  for (const [facet, entry] of byFacet) {
    const texts = entry.texts;
    const distinct = new Set(texts.map((t) => normalize(t).toLowerCase()));
    const facetStats: FacetStats = {
      count: texts.length,
      distinct: distinct.size,
      mean_len: texts.length === 0 ? 0 : texts.reduce((n, t) => n + t.length, 0) / texts.length,
      not_stated: entry.notStated ? 1 : 0,
    };
    (stats as Record<string, unknown>)[facet] = facetStats;
  }

  const sourceType = input.sourceType ?? "abstract";
  const finished = await db.transaction(async (tx) => {
    for (const row of pending) {
      const vector = vectorFor.get(row) ?? null;
      await insertAssertion(tx as unknown as Db, {
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        facet: row.facet,
        abstractionLevel: row.abstractionLevel,
        text: row.text,
        sourceType,
        sourceArtifactId: input.sourceArtifactId ?? null,
        textHash: row.selectors ? input.textHash : null,
        startOff: row.selectors?.startOff ?? null,
        endOff: row.selectors?.endOff ?? null,
        quote: row.selectors?.quote ?? null,
        provenance: {
          ...(input.provenance ?? { kind: "document", document_id: input.textHash }),
          ...(row.reason ? { reason: row.reason } : {}),
        } as Provenance,
        extractionRunId: run.id,
        evidenceType: row.evidenceType,
        embedding: vector,
        embeddingModel: vector ? embedded.model : null,
      });
    }
    const [updated] = await tx
      .update(extractionRuns)
      .set({
        status: "ok",
        stats,
        usage: sumUsage(usage, embedded.tokens == null ? null : { embedding_tokens: embedded.tokens }),
        derived: response!.output.derived ?? null,
        finishedAt: new Date(),
      })
      .where(eq(extractionRuns.id, run.id))
      .returning();
    return updated;
  });

  return finished;
}

/** The assertions one run wrote, oldest first. */
export async function runAssertions(db: Db, runId: string) {
  return db
    .select()
    .from(assertions)
    .where(eq(assertions.extractionRunId, runId))
    .orderBy(sql`${assertions.createdAt}`);
}
