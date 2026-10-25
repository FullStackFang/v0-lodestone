/** The tables. Shapes of every jsonb column come from `schema/card.ts`;
 *  this file is storage layout only. `drizzle-kit generate` turns it into
 *  `drizzle/*.sql`; nothing writes SQL by hand except the `vector` extension
 *  line prepended to the first migration. */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  halfvec,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import type {
  Beachhead,
  EconomicBuyer,
  Evidence,
  Facets,
  FounderContext,
  FourUs,
  Jtbd,
  KillAssumption,
  Provenance,
  RubricScores,
  Segment,
} from "@/schema/card";
import { CARD_STATUSES, STAGES } from "@/engine/stages";
import {
  ABSTRACTION_LEVELS,
  ASSERTION_STATUSES,
  CONFIDENCES,
  EDGE_TYPES,
  EVIDENCE_TYPES,
  FACETS,
  NOTE_KINDS,
  READING_MODES,
  RELATIONS,
  RUN_STATUSES,
  SOURCE_FORMATS,
  SOURCE_TYPES,
  SUBJECT_TYPES,
  VERDICTS,
  type MatchComponents,
  type Provenance as HarnessProvenance,
  type RunStats,
} from "@/harness/schema";

/** Voyage 3.5. `src/harness/embed.ts` asserts this against its own constant
 *  on load, so a dimension edited without a migration throws before a query
 *  runs. */
export const EMBEDDING_DIMENSIONS = 1024;

export const cardStatus = pgEnum("card_status", CARD_STATUSES);
export const stage = pgEnum("stage", STAGES);
export const gateResult = pgEnum("gate_result", ["pass", "fail"]);
export const documentSource = pgEnum("document_source", ["deck", "resume", "paper", "patent"]);

// The harness vocabulary, one enum per `src/harness/schema.ts` tuple.
export const subjectType = pgEnum("subject_type", SUBJECT_TYPES);
export const facet = pgEnum("facet", FACETS);
export const abstractionLevel = pgEnum("abstraction_level", ABSTRACTION_LEVELS);
export const sourceType = pgEnum("source_type", SOURCE_TYPES);
export const sourceFormat = pgEnum("source_format", SOURCE_FORMATS);
export const confidence = pgEnum("confidence", CONFIDENCES);
export const evidenceType = pgEnum("evidence_type", EVIDENCE_TYPES);
export const assertionStatus = pgEnum("assertion_status", ASSERTION_STATUSES);
export const runStatus = pgEnum("run_status", RUN_STATUSES);
export const edgeType = pgEnum("edge_type", EDGE_TYPES);
export const verdict = pgEnum("verdict", VERDICTS);
export const readingMode = pgEnum("reading_mode", READING_MODES);
export const noteKind = pgEnum("note_kind", NOTE_KINDS);
export const relation = pgEnum("relation", RELATIONS);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** A name and an email typed at intake. Not authentication — enough that
 *  "the same person" is a fact, that self can be excluded from matches, and
 *  that a judgment has a name on it. The harness reader is a row here too. */
export const person = pgTable("person", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: createdAt(),
});

export const session = pgTable("session", {
  id: id(),
  personId: uuid("person_id").references(() => person.id),
  authSessionId: text("auth_session_id").unique(),
  createdAt: createdAt(),
});

export const document = pgTable(
  "document",
  {
    id: id(),
    /** Nullable: a paper arrives from an ingest job, not from a session. */
    sessionId: uuid("session_id").references(() => session.id),
    source: documentSource("source").notNull(),
    title: text("title"),
    /** A deck's or résumé's text. Null for a paper or patent: its abstract's
     *  one home is `artifact_texts.canonical_text`. */
    text: text("text"),
    createdAt: createdAt(),
  },
  (t) => [
    index("document_session_idx").on(t.sessionId),
    // The digest's `since` scan and the corpus summary's newest per source.
    index("document_source_created_idx").on(t.source, t.createdAt),
    check("document_text_required", sql`${t.source} not in ('deck', 'resume') or ${t.text} is not null`),
  ],
);

export const thesisCard = pgTable(
  "thesis_card",
  {
    id: id(),
    sessionId: uuid("session_id").notNull().references(() => session.id),
    slug: text("slug").notNull().unique(),
    status: cardStatus("status").notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

    // The methodology — one column per field of `CardFields`.
    ideaText: text("idea_text"),
    offering: text("offering"),
    segment: jsonb("segment").$type<Segment>(),
    valueProposition: text("value_proposition"),
    jtbd: jsonb("jtbd").$type<Jtbd>(),
    economicBuyer: jsonb("economic_buyer").$type<EconomicBuyer>(),
    beachhead: jsonb("beachhead").$type<Beachhead>(),
    fourUs: jsonb("four_us").$type<FourUs>(),
    rubricScores: jsonb("rubric_scores").$type<RubricScores>(),
    killAssumption: jsonb("kill_assumption").$type<KillAssumption>(),
    facets: jsonb("facets").$type<Facets>(),
    /** Restored by the harness contract: what the founder has done, and who
     *  they are. Filling them is a track's work; the columns are here so
     *  neither track needs a migration. */
    evidence: jsonb("evidence").$type<Evidence[]>(),
    founderContext: jsonb("founder_context").$type<FounderContext>(),

    provenance: jsonb("provenance").$type<Provenance>().notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
  },
  (t) => [index("thesis_card_session_idx").on(t.sessionId)],
);

/** Append-only. One row per processed turn; the training asset. */
export const stageEvent = pgTable(
  "stage_event",
  {
    id: id(),
    sessionId: uuid("session_id").notNull().references(() => session.id),
    cardId: uuid("card_id").notNull().references(() => thesisCard.id),
    /** The stage that was current when the turn began. */
    stage: stage("stage").notNull(),
    userInputRaw: text("user_input_raw").notNull(),
    /** The validated patch that was applied — `{}` when nothing was. */
    extractedFields: jsonb("extracted_fields").notNull().default(sql`'{}'::jsonb`),
    /** The server's verdict on `stage` after the patch. */
    gateResult: gateResult("gate_result").notNull(),
    failReason: text("fail_reason"),
    /** The model's own claim, stored beside the verdict so disagreement is
     *  measurable. Null when the output never parsed. */
    proposedGate: jsonb("proposed_gate").$type<{ stage: string; result: string; reason: string }>(),
    modelConfidence: real("model_confidence"),
    /** The model's own count of load-bearing questions it still holds;
     *  the thread's status line. Null on a fallback turn. */
    questionsLeft: integer("questions_left"),
    promptVersion: text("prompt_version").notNull(),
    model: text("model").notNull(),
    usage: jsonb("usage").$type<Record<string, unknown>>(),
    /** True when the reply came from the prompt's fixed fallback question. */
    fallbackUsed: boolean("fallback_used").notNull().default(false),
    reply: text("reply").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("stage_event_card_idx").on(t.cardId, t.createdAt)],
);

/** The corpus vectors: one chunk per paper or patent, the whole abstract
 *  embedded. Half precision, which moves a cosine by about 1e-3, far inside
 *  every threshold, and indexed so a card's prior art is found in the
 *  database. `text` is null for a corpus chunk; the abstract lives in
 *  `artifact_texts`. */
export const documentChunk = pgTable(
  "document_chunk",
  {
    id: id(),
    documentId: uuid("document_id").notNull().references(() => document.id),
    ordinal: integer("ordinal").notNull(),
    text: text("text"),
    page: integer("page"),
    embedding: halfvec("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
  },
  (t) => [
    index("document_chunk_document_idx").on(t.documentId, t.ordinal),
    index("document_chunk_embedding_hnsw").using("hnsw", t.embedding.op("halfvec_cosine_ops")),
  ],
);

/** A corpus abstract cut into sentences, each embedded, so a hit can name
 *  the sentences nearest its block without a model. The text is never
 *  stored twice: the offsets (UTF-16 code units) slice the canonical text
 *  whose hash the row carries, and a row whose hash is not the document's
 *  newest is stale and re-cut. No index beyond the key: every read is by
 *  document, and the key leads with it. */
export const documentSentence = pgTable(
  "document_sentence",
  {
    documentId: uuid("document_id").notNull().references(() => document.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    textHash: text("text_hash").notNull(),
    startOff: integer("start_off").notNull(),
    endOff: integer("end_off").notNull(),
    embedding: halfvec("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.ordinal] })],
);

// ---------------------------------------------------------------------------
// The harness ledger
//
// One migration owns every table below, including the ones only one track
// uses. Two branches generating their own would collide on numbering, and a
// column either track might need is cheaper to reserve than to reconcile.
// ---------------------------------------------------------------------------

/** Every extracted text has exactly one canonical reading of record.
 *  `artifact_id` carries no foreign key: a `document`, a `stage_event` or a
 *  future table may own a text, and `source_format` says which. */
export const artifactTexts = pgTable(
  "artifact_texts",
  {
    id: id(),
    artifactId: uuid("artifact_id").notNull(),
    version: integer("version").notNull(),
    canonicalText: text("canonical_text").notNull(),
    textHash: text("text_hash").notNull().unique(),
    /** The normalization that produced it. A change to the rule is a new
     *  parser name and a new version — see `NORMALIZATION.md`. */
    parser: text("parser").notNull(),
    sourceFormat: sourceFormat("source_format").notNull(),
    provenance: jsonb("provenance").notNull().default(sql`'{}'::jsonb`).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("artifact_texts_artifact_idx").on(t.artifactId, t.version),
    // A source's own id names one work, so a second ingest of it is a no-op
    // at the database and not only in the loop that checks first. A DOI is
    // case-insensitive, so its key is lowered. The cost: a corpus text cannot
    // take a second version, because every version carries the same id; a
    // corrected abstract is a delete and re-ingest, not a re-parse.
    uniqueIndex("artifact_texts_openalex_id_unique")
      .on(sql`(${t.provenance}->>'openalex_id')`)
      .where(sql`${t.provenance}->>'openalex_id' is not null`),
    uniqueIndex("artifact_texts_doi_unique")
      .on(sql`lower(${t.provenance}->>'doi')`)
      .where(sql`${t.provenance}->>'doi' is not null`),
    uniqueIndex("artifact_texts_patent_number_unique")
      .on(sql`(${t.provenance}->>'patent_number')`)
      .where(sql`${t.provenance}->>'patent_number' is not null`),
    // The NeurIPS sheet's own id: a third of its rows have no OpenReview id.
    uniqueIndex("artifact_texts_neurips_id_unique")
      .on(sql`(${t.provenance}->>'neurips_id')`)
      .where(sql`${t.provenance}->>'neurips_id' is not null`),
  ],
);

/** Idempotent on content, extraction configuration, attribution, and attempt.
 *  The row is claimed `pending` before the model is called, so a crash
 *  cannot strand work, and `attempt` is what makes a forced re-run
 *  expressible against the unique key. */
export const extractionRuns = pgTable(
  "extraction_runs",
  {
    id: id(),
    textHash: text("text_hash")
      .notNull()
      .references(() => artifactTexts.textHash),
    variant: text("variant").notNull(),
    /** sha256 of the effective prompt text; `core_version` of `core.md`
     *  alone, so "every run at core v3" is a WHERE. */
    promptVersion: text("prompt_version").notNull(),
    coreVersion: text("core_version").notNull(),
    model: text("model").notNull(),
    attributionKey: text("attribution_key").notNull().default(""),
    attempt: integer("attempt").notNull().default(1),
    status: runStatus("status").notNull().default("pending"),
    error: text("error"),
    usage: jsonb("usage").$type<Record<string, unknown>>(),
    stats: jsonb("stats").$type<RunStats>(),
    /** Variant-specific synthesis with no quote to anchor. Opaque to the
     *  core, never an assertion. */
    derived: jsonb("derived").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    unique("extraction_runs_key").on(t.textHash, t.variant, t.promptVersion, t.model, t.attributionKey, t.attempt),
    index("extraction_runs_lookup_idx").on(t.textHash, t.variant, t.status, t.createdAt),
  ],
);

/** The ledger. Supersede-only; `DELETE` is revoked on the app role in
 *  production (the statement is a comment in `0001_harness.sql`) and
 *  `ledger.ts` exports nothing that deletes. */
export const assertions = pgTable(
  "assertions",
  {
    id: id(),
    subjectType: subjectType("subject_type").notNull(),
    /** Text, not uuid: a `person.id`, a card id and an `artifact_texts.id`
     *  all live here and no discriminated foreign key can hold all three. */
    subjectId: text("subject_id").notNull(),
    /** Null only for a reader's `insight` highlight not yet filed. */
    facet: facet("facet"),
    abstractionLevel: abstractionLevel("abstraction_level"),
    text: text("text").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    embeddingModel: text("embedding_model"),
    sourceType: sourceType("source_type").notNull(),
    sourceArtifactId: text("source_artifact_id"),
    textHash: text("text_hash").references(() => artifactTexts.textHash),
    /** UTF-16 code units into the canonical text. No SQL slices it. */
    startOff: integer("start_off"),
    endOff: integer("end_off"),
    quote: text("quote"),
    prefix: text("prefix"),
    suffix: text("suffix"),
    provenance: jsonb("provenance").notNull().$type<HarnessProvenance>(),
    extractionRunId: uuid("extraction_run_id").references(() => extractionRuns.id),
    confidence: confidence("confidence").notNull().default("extracted"),
    evidenceType: evidenceType("evidence_type"),
    status: assertionStatus("status").notNull().default("active"),
    supersededBy: uuid("superseded_by"),
    createdAt: createdAt(),
  },
  (t) => [
    index("assertions_subject_idx").on(t.subjectType, t.subjectId, t.status),
    index("assertions_text_hash_idx").on(t.textHash),
    index("assertions_facet_idx")
      .on(t.facet, t.abstractionLevel)
      .where(sql`${t.status} = 'active'`),
    check(
      "selectors_with_text",
      sql`(${t.textHash} is null) = (${t.startOff} is null and ${t.endOff} is null and ${t.quote} is null and ${t.prefix} is null and ${t.suffix} is null)`,
    ),
    check("facet_null_only_annotation", sql`${t.facet} is not null or ${t.sourceType} = 'annotation'`),
    check(
      "confirmed_is_human",
      sql`${t.confidence} <> 'confirmed' or ${t.sourceType} in ('annotation', 'subject_edit')`,
    ),
    // `jsonb_exists` rather than the `?` operator: no driver mistakes a
    // function call for a placeholder.
    check(
      "corroborated_names_source",
      sql`${t.confidence} <> 'corroborated' or jsonb_exists(${t.provenance}, 'corroborated_by')`,
    ),
    check("embedding_has_model", sql`(${t.embedding} is null) = (${t.embeddingModel} is null)`),
  ],
);

/** Computed candidates. Append-only; the newest per
 *  `(edge_type, query, candidate)` is current. */
export const matchResults = pgTable(
  "match_results",
  {
    id: id(),
    edgeType: edgeType("edge_type").notNull(),
    querySubjectType: subjectType("query_subject_type").notNull(),
    querySubjectId: text("query_subject_id").notNull(),
    candidateSubjectId: text("candidate_subject_id").notNull(),
    score: real("score").notNull(),
    rank: integer("rank").notNull(),
    components: jsonb("components").notNull().$type<MatchComponents>(),
    card: jsonb("card").$type<Record<string, unknown>>(),
    promptVersion: text("prompt_version"),
    /** sha256 over both subjects' sorted active assertion ids — a one-sided
     *  hash serves a stale card when the candidate has moved. */
    assertionSetHash: text("assertion_set_hash").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
    /** A result shown and never judged is an implicit negative; a result
     *  computed and never shown is not. */
    shownAt: timestamp("shown_at", { withTimezone: true }),
  },
  (t) => [
    index("match_results_lookup_idx").on(
      t.edgeType,
      t.querySubjectId,
      t.candidateSubjectId,
      t.computedAt.desc(),
    ),
  ],
);

/** A judgment is about a pairing, not two subjects in general: it names the
 *  reader's assertion that surfaced the candidate and the exact row shown at
 *  which rank. */
export const judgments = pgTable("judgments", {
  id: id(),
  readerId: text("reader_id").notNull(),
  edgeType: edgeType("edge_type").notNull(),
  queryAssertionId: uuid("query_assertion_id")
    .notNull()
    .references(() => assertions.id),
  candidateSubjectId: text("candidate_subject_id").notNull(),
  candidateAssertionIds: uuid("candidate_assertion_ids").array().notNull(),
  matchResultId: uuid("match_result_id")
    .notNull()
    .references(() => matchResults.id),
  rank: integer("rank").notNull(),
  verdict: verdict("verdict").notNull(),
  context: jsonb("context").notNull().default(sql`'{}'::jsonb`).$type<Record<string, unknown>>(),
  createdAt: createdAt(),
});

/** Band-pass parameters per edge. Abstracts and canvases have different
 *  specificity profiles; a λ tuned on paper→paper does not transfer. */
export const matchParams = pgTable("match_params", {
  edgeType: edgeType("edge_type").primaryKey(),
  lambda: real("lambda").notNull(),
  mu: real("mu").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** What a reader's highlight tag files. `writes_assertion` separates an
 *  unfiled row (`insight`) from no row at all (`note`) — a null facet alone
 *  cannot say which. */
export const tagFacetMap = pgTable(
  "tag_facet_map",
  {
    tag: text("tag").notNull(),
    subtype: text("subtype"),
    facet: facet("facet"),
    abstractionLevel: abstractionLevel("abstraction_level"),
    writesAssertion: boolean("writes_assertion").notNull(),
  },
  (t) => [
    unique("tag_facet_map_key").on(t.tag, t.subtype),
    uniqueIndex("tag_facet_map_default_idx")
      .on(t.tag)
      .where(sql`${t.subtype} is null`),
  ],
);

/** A reading pins the text version it was read against, so a re-parse never
 *  moves a highlight out from under it. */
export const readingSessions = pgTable("reading_sessions", {
  id: id(),
  readerId: text("reader_id").notNull(),
  artifactId: uuid("artifact_id").notNull(),
  textHash: text("text_hash")
    .notNull()
    .references(() => artifactTexts.textHash),
  mode: readingMode("mode").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const annotations = pgTable(
  "annotations",
  {
    id: id(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => readingSessions.id),
    textHash: text("text_hash")
      .notNull()
      .references(() => artifactTexts.textHash),
    startOff: integer("start_off").notNull(),
    endOff: integer("end_off").notNull(),
    quote: text("quote").notNull(),
    prefix: text("prefix").notNull().default(""),
    suffix: text("suffix").notNull().default(""),
    tag: text("tag").notNull(),
    mechanismSubtype: text("mechanism_subtype"),
    note: text("note"),
    /** The classification lives on the annotation so the label survives for
     *  notes that spawn no assertion. */
    noteKind: noteKind("note_kind"),
    notePromptVersion: text("note_prompt_version"),
    assertionId: uuid("assertion_id").references(() => assertions.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("annotations_session_idx").on(t.sessionId),
    index("annotations_text_hash_idx").on(t.textHash),
    check("note_required", sql`${t.tag} <> 'note' or ${t.note} is not null`),
  ],
);

/** Where a human highlight and a model assertion over the same text are
 *  compared. A `miss` has no model side. */
export const reconciliations = pgTable("reconciliations", {
  id: id(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => readingSessions.id),
  humanAnnotationId: uuid("human_annotation_id")
    .notNull()
    .references(() => annotations.id),
  modelAssertionId: uuid("model_assertion_id").references(() => assertions.id),
  relation: relation("relation").notNull(),
  overlap: real("overlap"),
  drift: jsonb("drift").$type<Record<string, unknown>>(),
  resolvedFacet: facet("resolved_facet"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export type SessionRow = typeof session.$inferSelect;
export type PersonRow = typeof person.$inferSelect;
export type ArtifactTextRow = typeof artifactTexts.$inferSelect;
export type AssertionRow = typeof assertions.$inferSelect;
export type NewAssertion = typeof assertions.$inferInsert;
export type ExtractionRunRow = typeof extractionRuns.$inferSelect;
export type MatchResultRow = typeof matchResults.$inferSelect;
export type JudgmentRow = typeof judgments.$inferSelect;
export type AnnotationRow = typeof annotations.$inferSelect;
export type ReadingSessionRow = typeof readingSessions.$inferSelect;
export type DocumentRow = typeof document.$inferSelect;
export type ThesisCardRow = typeof thesisCard.$inferSelect;
export type StageEventRow = typeof stageEvent.$inferSelect;
export type NewStageEvent = typeof stageEvent.$inferInsert;

export * from "./auth-schema";
export * from "./review-schema";
export * from "./matching-schema";
export * from "./resource-schema";
export * from "./library-schema";
export * from "./pilot-schema";
export * from "./operations-schema";
export * from "./measurement-schema";
export * from "./lodestone-schema";
