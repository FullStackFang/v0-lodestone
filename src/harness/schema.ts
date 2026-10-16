/** The harness vocabulary, in one place.
 *
 * Every enum here is exported twice: as a `const` tuple the Drizzle tables
 * turn into a Postgres enum, and as a Zod enum the write path validates
 * against. `enum-parity.test.ts` proves the two never drift; the migration
 * SQL is the third copy and it is checked against these too.
 *
 * The jsonb shapes live here as well, because a column whose shape is only
 * documented in a comment is a column two tracks will fill differently.
 */
import { z } from "zod";
import { EvidenceType } from "@/schema/card";

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export const SUBJECT_TYPES = ["person", "idea", "paper"] as const;
export const SubjectType = z.enum(SUBJECT_TYPES);
export type SubjectType = z.infer<typeof SubjectType>;

/** The closed facet vocabulary. `mechanism` without a subtype is a paper's
 *  "how" — a mechanism that is not a product, a channel, a price or a
 *  capability. `evidence` is an action the subject took; `evidence_type`
 *  says what kind. */
export const FACETS = [
  "purpose",
  "mechanism",
  "mechanism.product",
  "mechanism.distribution",
  "mechanism.revenue",
  "mechanism.capability",
  "mechanism_commanded",
  "mechanism_sought",
  "constraint",
  "domain",
  "evaluation",
  "evidence",
] as const;
export const Facet = z.enum(FACETS);
export type Facet = z.infer<typeof Facet>;

export const ABSTRACTION_LEVELS = ["specific", "abstract", "core"] as const;
export const AbstractionLevel = z.enum(ABSTRACTION_LEVELS);
export type AbstractionLevel = z.infer<typeof AbstractionLevel>;

export const SOURCE_TYPES = [
  "abstract",
  "deck",
  "resume",
  "canvas",
  "jtbd",
  "conversation",
  "annotation",
  "subject_edit",
] as const;
export const SourceType = z.enum(SOURCE_TYPES);
export type SourceType = z.infer<typeof SourceType>;

/** `tldr`: a corpus work with no abstract, kept on its Semantic Scholar
 *  TLDR and marked thin. */
export const SOURCE_FORMATS = ["abstract", "deck", "resume", "stage_event", "tldr"] as const;
export const SourceFormat = z.enum(SOURCE_FORMATS);
export type SourceFormat = z.infer<typeof SourceFormat>;

/** The four rungs. A model may only ever write the first; `repeated` needs a
 *  second source, `corroborated` needs a second person, `confirmed` is the
 *  subject's own word. */
export const CONFIDENCES = ["extracted", "repeated", "corroborated", "confirmed"] as const;
export const Confidence = z.enum(CONFIDENCES);
export type Confidence = z.infer<typeof Confidence>;

export { EVIDENCE_TYPES, EvidenceType } from "@/schema/card";

export const ASSERTION_STATUSES = ["active", "superseded"] as const;
export const AssertionStatus = z.enum(ASSERTION_STATUSES);
export type AssertionStatus = z.infer<typeof AssertionStatus>;

export const RUN_STATUSES = ["pending", "ok", "failed"] as const;
export const RunStatus = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof RunStatus>;

export const EDGE_TYPES = [
  "paper_analogy",
  "idea_paper_analogy",
  "prior_art",
  "cofounder",
  "competitor",
  "mentor",
] as const;
export const EdgeType = z.enum(EDGE_TYPES);
export type EdgeType = z.infer<typeof EdgeType>;

/** The costly actions and the later follow-up. There is no "accepted": a
 *  click is free and a free signal is worthless. */
export const VERDICTS = ["requested", "dismissed", "helped", "not_helpful"] as const;
export const Verdict = z.enum(VERDICTS);
export type Verdict = z.infer<typeof Verdict>;

export const READING_MODES = ["casual", "exhaustive"] as const;
export const ReadingMode = z.enum(READING_MODES);
export type ReadingMode = z.infer<typeof ReadingMode>;

export const NOTE_KINDS = ["query", "observation", "other"] as const;
export const NoteKind = z.enum(NOTE_KINDS);
export type NoteKind = z.infer<typeof NoteKind>;

export const RELATIONS = ["match", "boundary", "conflict", "miss"] as const;
export const Relation = z.enum(RELATIONS);
export type Relation = z.infer<typeof Relation>;

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** W3C-style position and quote selectors together. `start_off`/`end_off`
 *  are UTF-16 code units into the canonical text — see `NORMALIZATION.md`. */
export const Selectors = z
  .object({
    start_off: z.number().int().min(0),
    end_off: z.number().int().min(0),
    quote: z.string(),
    prefix: z.string(),
    suffix: z.string(),
  })
  .strict();
export type Selectors = z.infer<typeof Selectors>;

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

/** Discriminated on `kind`, never on `source_type`: the ladder has no source
 *  type and every track writes extension keys. Each variant is `.loose()`
 *  for that reason; the keys a reader can expect to find are:
 *
 *  `confirmed_by, corroborated_by, reconciled_from, superseded_reason,
 *  echoes, enums, evidence_type, edited_from, retracted, added_at,
 *  session_id, reader_id, context_quote, falsifiable, reason, field,
 *  patch_event_id, stage_event_id, ladder_of, document_id, annotation_id,
 *  available_from`. */
export const Provenance = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("annotation"), annotation_id: z.string() }).loose(),
  z
    .object({
      kind: z.literal("canvas"),
      card_id: z.string(),
      field: z.string(),
      patch_event_id: z.string(),
    })
    .loose(),
  z.object({ kind: z.literal("conversation"), stage_event_id: z.string() }).loose(),
  z.object({ kind: z.literal("document"), document_id: z.string() }).loose(),
  z.object({ kind: z.literal("ladder"), ladder_of: z.string() }).loose(),
  z.object({ kind: z.literal("subject_edit"), person_id: z.string() }).loose(),
  z.object({ kind: z.literal("reconciled"), reconciled_from: z.string() }).loose(),
  // A row projected from a Forge export. Not `canvas`: that kind's `card_id`
  // and `patch_event_id` are a thesis card's, and a Forge row would have to
  // fake them. `key` is the entry's supersede-chain root; extension keys are
  // `segment`, `free_endpoint`, `evidence` and `forge_run_id`.
  z
    .object({
      kind: z.literal("forge"),
      idea_id: z.string(),
      framework: z.string(),
      key: z.string(),
      block: z.string(),
    })
    .loose(),
]);
export type Provenance = z.infer<typeof Provenance>;

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/** What every variant returns. `prefix` is required because anchoring a
 *  short quote to its first occurrence corrupts gold silently, and `derived`
 *  is opaque: the core stores it on the run and never files it. */
export const ExtractionOutput = z
  .object({
    assertions: z.array(
      z
        .object({
          facet: Facet,
          abstraction_level: AbstractionLevel.nullish(),
          text: z.string().min(1),
          quote: z.string().min(1),
          prefix: z.string(),
          subject: SubjectType,
          evidence_type: EvidenceType.nullish(),
          reason: z.string().nullish(),
        })
        .loose(),
    ),
    not_stated: z.array(Facet),
    derived: z.record(z.string(), z.unknown()).nullish(),
  })
  .loose();
export type ExtractionOutput = z.infer<typeof ExtractionOutput>;

export const FacetStats = z
  .object({
    count: z.number().int().min(0),
    distinct: z.number().int().min(0),
    mean_len: z.number().min(0),
    not_stated: z.union([z.literal(0), z.literal(1)]),
  })
  .loose();
export type FacetStats = z.infer<typeof FacetStats>;

/** Loose so an adapter can add its own counters (`outside_window`,
 *  `no_person`) without a contract change. The per-facet keys ride here too:
 *  `stats["mechanism.revenue"]` is a `FacetStats`. */
export const RunStats = z
  .object({
    unanchored: z.number().int().min(0),
    ambiguous: z.number().int().min(0),
    dropped_invalid: z.number().int().min(0),
    embedded: z.boolean(),
  })
  .loose();
export type RunStats = {
  unanchored: number;
  ambiguous: number;
  dropped_invalid: number;
  embedded: boolean;
} & Partial<Record<Facet, FacetStats>> &
  Record<string, unknown>;

// ---------------------------------------------------------------------------
// Matching and judgment
// ---------------------------------------------------------------------------

/** The five facet families the band-pass scores over. */
export const FAMILIES = ["abs", "spec", "mech", "domain", "evidence"] as const;
export const Family = z.enum(FAMILIES);
export type Family = z.infer<typeof Family>;

const Contributor = z.object({ query: z.string(), candidate: z.string() }).strict();

export const MatchComponents = z
  .object({
    sim_abs: z.number(),
    sim_spec: z.number(),
    sim_mech: z.number(),
    sim_domain: z.number(),
    sim_evidence: z.number(),
    /** Which pair of assertions produced each family's maximum, so a
     *  judgment can name its query assertion without a second lookup. */
    contributors: z.partialRecord(Family, Contributor),
  })
  .loose();
export type MatchComponents = z.infer<typeof MatchComponents>;

export const Judgment = z
  .object({
    readerId: z.string().min(1),
    edgeType: EdgeType,
    queryAssertionId: z.string().min(1),
    candidateSubjectId: z.string().min(1),
    candidateAssertionIds: z.array(z.string()),
    matchResultId: z.string().min(1),
    rank: z.number().int().min(0),
    verdict: Verdict,
    context: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type Judgment = z.infer<typeof Judgment>;

// ---------------------------------------------------------------------------
// Card columns the contract restores
// ---------------------------------------------------------------------------

/** Defined in `card.ts` beside the fields they land in, re-exported here so
 *  the harness has one import for the whole vocabulary. */
export { Evidence, FounderContext } from "@/schema/card";
