/** A Forge idea, read as assertions. No model, no cost, no drift.
 *
 * Forge exports an idea as a `forge-idea` document — every workspace, each
 * canvas entry with its origin, its evidence quote and a stable `key` (the
 * first row of its supersede chain). This adapter projects that document into
 * the ledger the way `canvas.ts` projects a thesis card: through a table, not a
 * prompt. `MAPS` below is `design.md` D11 of the `forge-idea-bridge` change, and
 * `evals/harness/founder/forge-fixture.json` is what proves the two agree. The
 * fixture tests that the table is applied; only a bench can say it is right.
 *
 * The rules that earn their keep:
 *
 *   - Origin decides confidence, and a model's word is never promoted.
 *     `confirmed` is the author's mark (`subject_edit`); `draft` is `extracted`;
 *     `open` is a question, written with no vector and `free_endpoint`, never a
 *     candidate.
 *   - `(idea id, framework, key)` is the supersede key. A re-import writes
 *     nothing for an unchanged entry, supersedes a changed one, and retires one
 *     the export no longer carries. Nothing is updated in place or deleted.
 *   - Evidence is anchored, never guessed. The author's turns, joined with
 *     ` ¶ `, are one canonical text per workspace; a quote found once is placed,
 *     one found twice is `ambiguous`, one not found is `unanchored` — and both
 *     of those keep the quote in `provenance.evidence`.
 *   - Sides stay apart. An entry on a side names it in `provenance.segment`;
 *     nothing concatenates two sides, and a side's name is never an assertion.
 *   - What the author has is filed on the author: `key_resources` and prefixed
 *     profile facts go on one local person row.
 *
 * Each workspace that writes claims a model-free `extraction_runs` row —
 * variant `forge`, model `none`, `prompt_version` the sha256 of its table — so
 * a changed table is a new version exactly as a changed prompt is, and the
 * purpose ladder can run over it unchanged.
 */
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { assertions, extractionRuns, type AssertionRow, type ExtractionRunRow } from "@/db/schema";
import { normalize, putArtifactText } from "../canonical";
import type { EmbedResult } from "../embed";
import { anchor } from "../extract/anchor";
import { claimExtractionRun, type ExtractDeps } from "../extract/core";
import { ladder } from "../extract/ladder";
import { NOT_STATED, ensurePerson, insertAssertion, supersede, type InsertAssertionInput } from "../ledger";
import type { AbstractionLevel, Facet, Provenance, RunStats } from "../schema";
import { TURN_SEPARATOR } from "./conversation";

// ---------------------------------------------------------------------------
// The documents. Input is untrusted: parsed, never cast.
// ---------------------------------------------------------------------------

const Origin = z.enum(["confirmed", "draft", "open"]);
const Thread = z.array(z.object({ role: z.enum(["you", "forge"]), text: z.string(), at: z.string() }));
const Segments = z.array(z.object({ name: z.string(), origin: z.string() }));
const Profile = z.record(z.string(), z.string());

export const ForgeEntryV2 = z.object({
  key: z.string().min(1),
  block: z.string().min(1),
  text: z.string(),
  origin: Origin,
  evidence: z.string().nullable(),
  segment: z.string().nullable(),
  run_id: z.string().nullable(),
});

export const ForgeWorkspaceV2 = z.object({
  framework: z.string().min(1),
  grade: z.unknown().nullable(),
  segments: Segments,
  canvas: z.array(ForgeEntryV2),
  thread: Thread,
});

export const ForgeIdeaV2 = z.object({
  format: z.literal("forge-idea/2"),
  id: z.string().min(1),
  title: z.string(),
  line: z.string(),
  seed: z.object({ starter: z.string(), snapshot_id: z.string().nullable() }).nullable(),
  profile: Profile,
  workspaces: z.array(ForgeWorkspaceV2),
});
export type ForgeIdeaV2 = z.infer<typeof ForgeIdeaV2>;

/** A paper the author already holds — today the one a paper-seeded idea
 *  started from. Ids and a title only, never the abstract: the network flags a
 *  corpus match against it as the author's own rather than as a find. */
export const AlreadyHave = z.array(
  z.object({ id: z.string().min(1), title: z.string(), doi: z.string().nullable().optional() }),
);

/** `/2` plus `already_have`. Everything else is the same document. */
export const ForgeIdeaV3 = ForgeIdeaV2.extend({
  format: z.literal("forge-idea/3"),
  already_have: AlreadyHave.default([]),
});
export type ForgeIdeaV3 = z.infer<typeof ForgeIdeaV3>;

export const ForgeIdeaV1 = z.object({
  format: z.literal("forge-idea/1"),
  title: z.string(),
  line: z.string(),
  grade: z.unknown().nullable(),
  segments: Segments,
  canvas: z.array(
    z.object({
      block: z.string().min(1),
      text: z.string(),
      origin: Origin,
      evidence: z.string().nullable(),
      segment: z.string().nullable(),
    }),
  ),
  profile: Profile,
  thread: Thread,
});
export type ForgeIdeaV1 = z.infer<typeof ForgeIdeaV1>;

/** What the projection reads, whichever format arrived. */
export interface ForgeIdea {
  format: "forge-idea/1" | "forge-idea/2" | "forge-idea/3";
  ideaId: string;
  /** False for `/1`: entry keys were minted here, so nothing can supersede. */
  stableKeys: boolean;
  profile: Record<string, string>;
  /** The papers the author holds; empty before `/3`. */
  alreadyHave: { id: string; title: string; doi: string | null }[];
  workspaces: {
    framework: string;
    thread: { role: "you" | "forge"; text: string }[];
    canvas: { key: string; block: string; text: string; origin: z.infer<typeof Origin>; evidence: string | null; segment: string | null }[];
  }[];
}

/** Parse either format. A `/1` document becomes one Business Model workspace;
 *  its idea id is derived from its title and line (it carries none) and its
 *  entry keys are fresh on every import. */
export function parseForgeIdea(input: unknown): ForgeIdea {
  const format = (input as { format?: unknown } | null)?.format;
  if (format === "forge-idea/1") {
    const doc = ForgeIdeaV1.parse(input);
    const importId = randomUUID();
    return {
      format: "forge-idea/1",
      ideaId: createHash("sha256").update(`${doc.title}\n${doc.line}`, "utf8").digest("hex").slice(0, 32),
      stableKeys: false,
      profile: doc.profile,
      alreadyHave: [],
      workspaces: [
        {
          framework: "business_model",
          thread: doc.thread,
          canvas: doc.canvas.map((e, at) => ({ ...e, key: `v1:${importId}:${at}` })),
        },
      ],
    };
  }
  const doc = format === "forge-idea/3" ? ForgeIdeaV3.parse(input) : ForgeIdeaV2.parse(input);
  return {
    format: doc.format,
    ideaId: doc.id,
    stableKeys: true,
    profile: doc.profile,
    alreadyHave:
      "already_have" in doc ? doc.already_have.map((a) => ({ id: a.id, title: a.title, doi: a.doi ?? null })) : [],
    workspaces: doc.workspaces.map((w) => ({ framework: w.framework, thread: w.thread, canvas: w.canvas })),
  };
}

// ---------------------------------------------------------------------------
// The tables
// ---------------------------------------------------------------------------

export interface FacetTarget {
  subject: "idea" | "person";
  facet: Facet;
  level: AbstractionLevel | null;
}
export type FrameworkMap = Record<string, FacetTarget>;

const idea = (facet: Facet, level: AbstractionLevel | null = null): FacetTarget => ({ subject: "idea", facet, level });

/** D11, one table per framework key. `customer_segments → domain` is an
 *  embedded row, as the author decided (task 1.3): `canvas.ts` embeds a
 *  card's segment description the same way, and dropping it would split Forge
 *  ideas from card ideas on every edge that reads `sim_domain`. */
export const MAPS: Record<string, FrameworkMap> = {
  business_model: {
    value_proposition: idea("purpose", "specific"),
    customer_segments: idea("domain"),
    channels: idea("mechanism.distribution"),
    relationships: idea("mechanism.distribution"),
    revenue_streams: idea("mechanism.revenue"),
    key_activities: idea("mechanism.capability"),
    key_partners: idea("mechanism.capability"),
    key_resources: { subject: "person", facet: "mechanism_commanded", level: null },
    cost_structure: idea("constraint"),
  },
  value_proposition: {
    customer_jobs: idea("purpose", "abstract"),
    pains: idea("constraint"),
    gains: idea("purpose", "specific"),
    products_services: idea("mechanism.product"),
    pain_relievers: idea("mechanism.product"),
    gain_creators: idea("mechanism.product"),
  },
};

/** Profile facts by key prefix. Anything else is skipped and counted. */
export const PROFILE_PREFIXES: readonly (readonly [string, Facet])[] = [
  ["skill_", "mechanism_commanded"],
  ["credential_", "mechanism_commanded"],
  ["network_", "mechanism_commanded"],
  ["industry_", "domain"],
  ["field_", "domain"],
  ["location_", "domain"],
];

/** The pseudo-framework profile rows are filed under. */
const PROFILE = "profile";

/** sha256 of a table serialized with sorted keys — the run's `prompt_version`. */
export function mapVersion(map: FrameworkMap): string {
  const sorted = Object.keys(map)
    .sort()
    .map((block) => [block, map[block].subject, map[block].facet, map[block].level]);
  return createHash("sha256").update(JSON.stringify(sorted), "utf8").digest("hex");
}

export const DEFAULT_PERSON_EMAIL = "author@forge.local";

export function forgeSubject(ideaId: string): string {
  return `forge:${ideaId}`;
}

// ---------------------------------------------------------------------------
// The projection
// ---------------------------------------------------------------------------

type AnchorOutcome = "anchored" | "ambiguous" | "unanchored";

/** One row the document implies, before it is compared with the ledger. */
interface Desired {
  framework: string;
  key: string;
  block: string;
  target: FacetTarget;
  text: string;
  origin: "confirmed" | "draft" | "open";
  segment: string | null;
  evidence: string | null;
  anchor: AnchorOutcome;
  selectors: { startOff: number; endOff: number; quote: string } | null;
}

export interface ForgeRunReport {
  framework: string;
  runId: string;
  promptVersion: string;
}

export interface ForgeImportReport {
  format: ForgeIdea["format"];
  ideaId: string;
  written: number;
  superseded: number;
  retired: number;
  unchanged: number;
  anchored: number;
  ambiguous: number;
  unanchored: number;
  profileSkipped: number;
  unmappedFrameworks: string[];
  runs: ForgeRunReport[];
  ladderRuns: ExtractionRunRow[];
  warnings: string[];
}

export interface ForgeOptions {
  /** The one local person `key_resources` and profile facts are filed on. */
  personEmail?: string;
  /** Run the purpose ladder over the projected runs — a model call through
   *  the author's own engine. Off by default. */
  ladder?: boolean;
  /** Replace the tables — for the test that a changed table is a new version. */
  maps?: Record<string, FrameworkMap>;
}

/** An embedder that sends nothing. The projection never embeds; vectors are
 *  the CLI's explicit opt-in, through `embedForgeRows`. */
const noEmbed = async (texts: string[]): Promise<EmbedResult> => ({
  vectors: texts.map(() => null),
  embedded: false,
  model: null,
  tokens: null,
});

/** The author's turns as one canonical text, and where each quote lands. */
function anchorAll(thread: ForgeIdea["workspaces"][number]["thread"], evidence: (string | null)[]) {
  const canonical = normalize(thread.filter((t) => t.role === "you").map((t) => t.text).join(TURN_SEPARATOR));
  const placed = evidence.map((quote) => {
    const q = quote === null ? "" : normalize(quote);
    if (!q) return { anchor: "unanchored" as const, selectors: null };
    const at = anchor(canonical, q);
    if (!at.ok) return { anchor: at.reason, selectors: null };
    return {
      anchor: "anchored" as const,
      selectors: { startOff: at.start, endOff: at.end, quote: canonical.slice(at.start, at.end) },
    };
  });
  return { canonical, placed };
}

const confidenceOf = (origin: Desired["origin"]) => (origin === "confirmed" ? "confirmed" : "extracted");
const sourceTypeOf = (origin: Desired["origin"]) => (origin === "confirmed" ? "subject_edit" : "canvas");

/** The row as the ledger would hold it, compared field by field. */
function differs(old: AssertionRow, next: Desired, subjectId: string): boolean {
  const p = old.provenance as Record<string, unknown>;
  return (
    old.text !== next.text ||
    old.facet !== next.target.facet ||
    old.abstractionLevel !== next.target.level ||
    old.subjectType !== next.target.subject ||
    old.subjectId !== subjectId ||
    old.confidence !== confidenceOf(next.origin) ||
    ((p.segment as string | undefined) ?? null) !== next.segment ||
    (p.free_endpoint === true) !== (next.origin === "open")
  );
}

function inputFor(
  next: Desired,
  ctx: { ideaId: string; subjectId: string; textHash: string | null; runId: string | null },
): InsertAssertionInput {
  const provenance: Record<string, unknown> = {
    kind: "forge",
    idea_id: ctx.ideaId,
    framework: next.framework,
    key: next.key,
    block: next.block,
  };
  if (next.segment !== null) provenance.segment = next.segment;
  if (next.origin === "open") provenance.free_endpoint = true;
  if (next.selectors === null) {
    provenance.anchor = next.anchor;
    if (next.evidence !== null) provenance.evidence = next.evidence;
  }
  const isProfile = next.framework === PROFILE;
  return {
    subjectType: next.target.subject,
    subjectId: ctx.subjectId,
    facet: next.target.facet,
    abstractionLevel: next.target.level,
    text: next.text,
    // A profile fact is harvested from the thread by extraction: a model's
    // reading of a turn, never the author's mark.
    sourceType: isProfile ? "conversation" : sourceTypeOf(next.origin),
    sourceArtifactId: forgeSubject(ctx.ideaId),
    textHash: next.selectors ? ctx.textHash : null,
    startOff: next.selectors?.startOff ?? null,
    endOff: next.selectors?.endOff ?? null,
    quote: next.selectors?.quote ?? null,
    provenance: provenance as Provenance,
    extractionRunId: ctx.runId,
    confidence: isProfile ? "extracted" : confidenceOf(next.origin),
    embedding: null,
    embeddingModel: null,
  };
}

/** Active Forge rows under one supersede scope. */
async function activeRows(db: Db, scope: { ideaId?: string; framework: string; subjectId?: string }) {
  return db
    .select()
    .from(assertions)
    .where(
      and(
        eq(assertions.status, "active"),
        sql`${assertions.provenance} ->> 'kind' = 'forge'`,
        sql`${assertions.provenance} ->> 'framework' = ${scope.framework}`,
        scope.ideaId === undefined ? undefined : sql`${assertions.provenance} ->> 'idea_id' = ${scope.ideaId}`,
        scope.subjectId === undefined ? undefined : eq(assertions.subjectId, scope.subjectId),
      ),
    );
}

/** A row that stopped being current takes its ladder rungs with it: they
 *  lift words that are no longer the author's. The rungs of its successor
 *  come from the successor's own ladder run. */
async function retireRungs(db: Db, ids: string[], reason: string) {
  if (ids.length === 0) return;
  await db
    .update(assertions)
    .set({
      status: "superseded",
      provenance: sql`${assertions.provenance} || ${JSON.stringify({ superseded_reason: reason })}::jsonb`,
    })
    .where(
      and(
        eq(assertions.status, "active"),
        sql`${assertions.provenance} ->> 'kind' = 'ladder'`,
        inArray(sql`${assertions.provenance} ->> 'ladder_of'`, ids),
      ),
    );
}

async function retire(db: Db, row: AssertionRow, reason: string) {
  await db
    .update(assertions)
    .set({
      status: "superseded",
      provenance: sql`${assertions.provenance} || ${JSON.stringify({ superseded_reason: reason })}::jsonb`,
    })
    .where(and(eq(assertions.id, row.id), eq(assertions.status, "active")));
  await retireRungs(db, [row.id], reason);
}

interface DiffResult {
  written: number;
  superseded: number;
  retired: number;
  unchanged: number;
}

/** Write the difference between what the document implies and what the ledger
 *  holds for one scope. `claim` is called only when something will be written,
 *  so an unchanged import claims no run. */
async function applyDiff(
  db: Db,
  desired: Desired[],
  current: AssertionRow[],
  opts: {
    stableKeys: boolean;
    subjectOf: (d: Desired) => string;
    claim: () => Promise<{ runId: string | null; textHash: string | null }>;
    ideaId: string;
    removedReason: string;
  },
): Promise<DiffResult & { writtenRows: Desired[] }> {
  const result = { written: 0, superseded: 0, retired: 0, unchanged: 0, writtenRows: [] as Desired[] };
  const byKey = new Map(current.map((row) => [String((row.provenance as Record<string, unknown>).key), row]));

  const toWrite: { next: Desired; old: AssertionRow | null }[] = [];
  for (const next of desired) {
    const old = opts.stableKeys ? byKey.get(next.key) ?? null : null;
    if (old && !differs(old, next, opts.subjectOf(next))) result.unchanged += 1;
    else toWrite.push({ next, old });
  }
  const wanted = new Set(desired.map((d) => d.key));
  const removed = opts.stableKeys
    ? current.filter((row) => !wanted.has(String((row.provenance as Record<string, unknown>).key)))
    : [];

  if (toWrite.length > 0) {
    const ctx = await opts.claim();
    for (const { next, old } of toWrite) {
      const input = inputFor(next, { ideaId: opts.ideaId, subjectId: opts.subjectOf(next), ...ctx });
      if (old) {
        await supersede(db, old.id, input, "entry_changed");
        await retireRungs(db, [old.id], "entry_changed");
        result.superseded += 1;
      } else {
        await insertAssertion(db, input);
      }
      result.written += 1;
      result.writtenRows.push(next);
    }
  }
  for (const row of removed) {
    await retire(db, row, opts.removedReason);
    result.retired += 1;
  }
  return result;
}

/**
 * Project a `forge-idea` document into the ledger.
 *
 * Idempotent: importing the same document twice writes nothing the second
 * time. Makes no model call unless `options.ladder`, and no embedding request
 * ever — see `pendingEmbeds` / `embedForgeRows` for the explicit opt-in.
 */
export async function projectForgeIdea(
  db: Db,
  input: unknown,
  options: ForgeOptions = {},
  deps: ExtractDeps = {},
): Promise<ForgeImportReport> {
  const doc = parseForgeIdea(input);
  const maps = options.maps ?? MAPS;
  const personId = await ensurePerson(db, {
    name: "Forge author",
    email: options.personEmail ?? DEFAULT_PERSON_EMAIL,
  });
  const ideaSubject = forgeSubject(doc.ideaId);
  const subjectOf = (d: Desired) => (d.target.subject === "person" ? personId : ideaSubject);

  const report: ForgeImportReport = {
    format: doc.format,
    ideaId: doc.ideaId,
    written: 0,
    superseded: 0,
    retired: 0,
    unchanged: 0,
    anchored: 0,
    ambiguous: 0,
    unanchored: 0,
    profileSkipped: 0,
    unmappedFrameworks: [],
    runs: [],
    ladderRuns: [],
    warnings: doc.stableKeys
      ? []
      : ["forge-idea/1 has no stable keys: nothing can be superseded, and importing this file again will duplicate every entry. Re-export from Forge as forge-idea/2."],
  };
  const add = (r: DiffResult) => {
    report.written += r.written;
    report.superseded += r.superseded;
    report.retired += r.retired;
    report.unchanged += r.unchanged;
  };

  // --- the workspaces -----------------------------------------------------
  for (const workspace of doc.workspaces) {
    const map = maps[workspace.framework];
    if (!map) {
      if (!report.unmappedFrameworks.includes(workspace.framework)) report.unmappedFrameworks.push(workspace.framework);
      continue;
    }
    const mapped = workspace.canvas.filter((e) => map[e.block] !== undefined);
    const { canonical, placed } = anchorAll(workspace.thread, mapped.map((e) => e.evidence));
    const desired: Desired[] = mapped.map((e, at) => ({
      framework: workspace.framework,
      key: e.key,
      block: e.block,
      target: map[e.block],
      text: e.text,
      origin: e.origin,
      segment: e.segment,
      evidence: e.evidence,
      anchor: placed[at].anchor,
      selectors: placed[at].selectors,
    }));

    const promptVersion = mapVersion(map);
    let run: ExtractionRunRow | null = null;
    const claim = async () => {
      const put = await putArtifactText(db, {
        artifactId: doc.ideaId,
        sourceFormat: "stage_event",
        parser: "forge-thread-v1",
        text: canonical,
        provenance: { forge_idea_id: doc.ideaId, framework: workspace.framework },
      });
      // A fresh attempt every time something changed: the ladder is keyed on
      // the source run, so rows written now need a run no ladder has seen.
      const claimed = await claimExtractionRun(
        db,
        {
          textHash: put.textHash,
          variant: "forge",
          promptVersion,
          model: "none",
          attributionKey: `${ideaSubject}:${workspace.framework}`,
        },
        "none",
        true,
      );
      run = claimed.run;
      return { runId: run.id, textHash: put.textHash };
    };

    const scope = await activeRows(db, { ideaId: doc.ideaId, framework: workspace.framework });
    try {
      const diff = await applyDiff(db, desired, scope, {
        stableKeys: doc.stableKeys,
        subjectOf,
        claim,
        ideaId: doc.ideaId,
        removedReason: "entry_removed",
      });
      add(diff);
      const counts = { anchored: 0, ambiguous: 0, unanchored: 0 };
      for (const row of diff.writtenRows) counts[row.anchor] += 1;
      report.anchored += counts.anchored;
      report.ambiguous += counts.ambiguous;
      report.unanchored += counts.unanchored;

      const claimed = run as ExtractionRunRow | null;
      if (claimed) {
        const stats: RunStats & Record<string, unknown> = {
          unanchored: counts.unanchored,
          ambiguous: counts.ambiguous,
          dropped_invalid: 0,
          embedded: false,
          anchored: counts.anchored,
          written: diff.written,
          superseded: diff.superseded,
          retired: diff.retired,
        };
        await db
          .update(extractionRuns)
          .set({ status: "ok", stats, finishedAt: new Date() })
          .where(eq(extractionRuns.id, claimed.id));
        report.runs.push({ framework: workspace.framework, runId: claimed.id, promptVersion });
      }
    } catch (err) {
      const claimed = run as ExtractionRunRow | null;
      if (claimed) {
        await db
          .update(extractionRuns)
          .set({ status: "failed", error: (err instanceof Error ? err.message : String(err)).slice(0, 1000), finishedAt: new Date() })
          .where(eq(extractionRuns.id, claimed.id));
      }
      throw err;
    }
  }

  // --- the profile --------------------------------------------------------
  const facts: Desired[] = [];
  for (const [key, value] of Object.entries(doc.profile).sort((a, b) => a[0].localeCompare(b[0]))) {
    const prefix = PROFILE_PREFIXES.find(([p]) => key.startsWith(p));
    if (!prefix || value.trim() === "") {
      report.profileSkipped += 1;
      continue;
    }
    facts.push({
      framework: PROFILE,
      key: `${PROFILE}:${key}`,
      block: key,
      target: { subject: "person", facet: prefix[1], level: null },
      text: value,
      origin: "draft",
      segment: null,
      evidence: null,
      anchor: "unanchored",
      selectors: null,
    });
  }
  // Profile keys are stable in every format, and the profile is the author's
  // rather than the idea's: scoped by person, not by idea.
  add(
    await applyDiff(db, facts, await activeRows(db, { framework: PROFILE, subjectId: personId }), {
      stableKeys: true,
      subjectOf,
      claim: async () => ({ runId: null, textHash: null }),
      ideaId: doc.ideaId,
      removedReason: "fact_removed",
    }),
  );

  // --- the ladder ---------------------------------------------------------
  if (options.ladder) {
    const sources = await db
      .selectDistinct({ runId: assertions.extractionRunId })
      .from(assertions)
      .where(
        and(
          eq(assertions.status, "active"),
          eq(assertions.subjectId, ideaSubject),
          eq(assertions.facet, "purpose"),
          eq(assertions.abstractionLevel, "specific"),
          sql`${assertions.provenance} ->> 'kind' = 'forge'`,
        ),
      );
    for (const { runId } of sources) {
      if (runId === null) continue;
      report.ladderRuns.push(await ladder(db, runId, { ...deps, embed: deps.embed ?? noEmbed }));
    }
  }

  return report;
}

// ---------------------------------------------------------------------------
// Vectors: an explicit opt-in, and never for a question
// ---------------------------------------------------------------------------

/** The rows an `--embed` run would send for this idea: active Forge rows and
 *  their ladder rungs with no vector — never an `open` entry, never
 *  `not_stated`. What is listed here is exactly what `embedForgeRows` sends. */
export async function pendingEmbeds(db: Db, ideaId: string): Promise<AssertionRow[]> {
  const rows = await db
    .select()
    .from(assertions)
    .where(
      and(
        eq(assertions.status, "active"),
        isNull(assertions.embedding),
        sql`coalesce(${assertions.provenance} ->> 'free_endpoint', 'false') <> 'true'`,
        sql`(
          (${assertions.provenance} ->> 'kind' = 'forge' and ${assertions.provenance} ->> 'idea_id' = ${ideaId})
          or (${assertions.provenance} ->> 'kind' = 'ladder' and ${assertions.subjectId} = ${forgeSubject(ideaId)})
        )`,
      ),
    );
  return rows.filter((r) => r.text !== NOT_STATED);
}

/** Embed exactly the rows given, in one call, and write their vectors. */
export async function embedForgeRows(
  db: Db,
  rows: AssertionRow[],
  embed: (texts: string[], inputType?: "document" | "query") => Promise<EmbedResult>,
): Promise<{ embedded: number; tokens: number | null }> {
  const sendable = rows.filter(
    (r) => r.text !== NOT_STATED && (r.provenance as Record<string, unknown>).free_endpoint !== true,
  );
  if (sendable.length === 0) return { embedded: 0, tokens: 0 };
  const result = await embed(
    sendable.map((r) => r.text),
    "document",
  );
  if (!result.embedded) return { embedded: 0, tokens: result.tokens };
  let embedded = 0;
  for (const [at, row] of sendable.entries()) {
    const vector = result.vectors[at];
    if (!vector) continue;
    await db
      .update(assertions)
      .set({ embedding: vector, embeddingModel: result.model })
      .where(eq(assertions.id, row.id));
    embedded += 1;
  }
  return { embedded, tokens: result.tokens };
}

// ---------------------------------------------------------------------------
// The CLI, as a function the tests can drive
// ---------------------------------------------------------------------------

export interface ForgeCliIo {
  readFile: (file: string) => string;
  log: (line: string) => void;
  /** The hosted embedder `--embed voyage` sends to. Never called otherwise. */
  embed: (texts: string[], inputType?: "document" | "query") => Promise<EmbedResult>;
  embeddingModel: string;
}

export const FORGE_USAGE =
  "usage: npm run harness:forge -- <forge-idea.json> [--person-email <email>] [--ladder] [--embed voyage]";

/** `npm run harness:forge`. Returns the exit code. */
export async function forgeCli(db: Db, argv: string[], io: ForgeCliIo, deps: ExtractDeps = {}): Promise<number> {
  const value = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const flagged = new Set(["--person-email", "--embed"].flatMap((f) => (argv.includes(f) ? [value(f)] : [])));
  const file = argv.find((a) => !a.startsWith("--") && !flagged.has(a));
  const embedWith = value("--embed");
  if (!file || (argv.includes("--embed") && embedWith !== "voyage")) {
    io.log(FORGE_USAGE);
    return 1;
  }

  const report = await projectForgeIdea(
    db,
    JSON.parse(io.readFile(file)) as unknown,
    { personEmail: value("--person-email"), ladder: argv.includes("--ladder") },
    deps,
  );

  io.log(`${report.format} ${report.ideaId}`);
  for (const warning of report.warnings) io.log(`warning: ${warning}`);
  io.log(
    `rows: ${report.written} written (${report.superseded} superseding), ${report.retired} retired, ` +
      `${report.unchanged} unchanged`,
  );
  io.log(`evidence: ${report.anchored} anchored, ${report.ambiguous} ambiguous, ${report.unanchored} unanchored`);
  io.log(`profile facts skipped: ${report.profileSkipped}`);
  io.log(`unmapped frameworks: ${report.unmappedFrameworks.length ? report.unmappedFrameworks.join(", ") : "none"}`);
  for (const run of report.runs) io.log(`run ${run.framework}: ${run.runId} (table ${run.promptVersion.slice(0, 12)})`);
  for (const run of report.ladderRuns) io.log(`ladder ${run.id}: ${run.status}${run.error ? ` — ${run.error}` : ""}`);

  if (embedWith === "voyage") {
    const pending = await pendingEmbeds(db, report.ideaId);
    // Said before the first request, so the author sees what leaves.
    io.log(
      `sending ${pending.length} row${pending.length === 1 ? "" : "s"} to ${io.embeddingModel}: ` +
        `${JSON.stringify(facetCounts(pending))} (open questions are never sent)`,
    );
    const sent = await embedForgeRows(db, pending, io.embed);
    io.log(`embedded ${sent.embedded} of ${pending.length} · tokens ${sent.tokens ?? "unknown"}`);
  } else {
    io.log("vectors: none sent (pass --embed voyage to opt in)");
  }
  return report.ladderRuns.some((r) => r.status === "failed") ? 1 : 0;
}

/** Rows by facet, for the line the CLI prints before anything is sent. */
export function facetCounts(rows: AssertionRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const facet = row.abstractionLevel ? `${row.facet}@${row.abstractionLevel}` : String(row.facet);
    counts[facet] = (counts[facet] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0])));
}
