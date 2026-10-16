import { sql } from "drizzle-orm";
import { check, halfvec, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { document, person } from "./schema";

/** Where a Forge card can be seen. `private` is the default and the state a
 *  card returns to when its owner withdraws it. `cohort` is every active
 *  pilot member. There is no wider audience in this pilot. */
export type ForgeCardVisibility = "private" | "cohort";

/** A Forge idea as the network holds it: the export document itself, kept
 *  whole so the card renders exactly what the author exported, beside the
 *  ledger rows `projectForgeIdea` filed from it under `forge:<idea_id>`.
 *  One row per Forge idea; a re-import replaces `doc` and bumps `updated_at`,
 *  and the ledger supersedes underneath it. */
export const forgeCard = pgTable("forge_card", {
  /** Forge's own idea id: 32 hex characters, the same string the ledger's
   *  `forge:` subject carries. */
  ideaId: text("idea_id").primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => person.id),
  title: text("title").notNull(),
  line: text("line").notNull(),
  doc: jsonb("doc").$type<Record<string, unknown>>().notNull(),
  visibility: text("visibility").$type<ForgeCardVisibility>().notNull().default("private"),
  /** When the card last became visible to the cohort. Null while private. */
  publishedAt: timestamp("published_at", { withTimezone: true }),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("forge_card_owner_idx").on(t.ownerId),
  index("forge_card_visibility_idx").on(t.visibility, t.publishedAt),
  check("forge_card_visibility_valid", sql`${t.visibility} in ('private', 'cohort')`),
  check("forge_card_published_when_visible", sql`(${t.visibility} = 'cohort') = (${t.publishedAt} is not null)`),
]);

export type ForgeCardRow = typeof forgeCard.$inferSelect;

export type CardSearchState = "running" | "done";
/** Per source: documents new to the corpus, already held, Semantic Scholar
 *  hits without a DOI, and the error that stopped it, if any. */
export type CardSearchSources = Record<
  string,
  { new: number; existing: number; skipped_no_doi?: number; skipped_not_scholarly?: number; error?: string }
>;

/** The last search run for one block of one card. `text_hash` is the sha256
 *  of the block's entry texts in canvas order: a re-import searches a block
 *  only when it changed, or when its row has sat `running` past the stale
 *  window. No other member's token reads this table. */
export const cardSearch = pgTable("card_search", {
  ideaId: text("idea_id").notNull().references(() => forgeCard.ideaId, { onDelete: "cascade" }),
  /** The block key: `value_proposition`, never its label. */
  block: text("block").notNull(),
  textHash: text("text_hash").notNull(),
  state: text("state").$type<CardSearchState>().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  sources: jsonb("sources").$type<CardSearchSources>().notNull().default(sql`'{}'::jsonb`),
  /** Documents this run added to the corpus. */
  found: integer("found").notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.ideaId, t.block] }),
  check("card_search_state_valid", sql`${t.state} in ('running', 'done')`),
]);

export type CardSearchRow = typeof cardSearch.$inferSelect;

/** A bearer token a member mints for a client of their own, Whetstone being
 *  the first. The token itself is shown once and never stored; the row holds
 *  its sha256. Revocation is a timestamp, so a client that keeps using a
 *  revoked token fails closed and the row still says when it was cut. */
export const apiToken = pgTable("api_token", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id").notNull().references(() => person.id),
  tokenHash: text("token_hash").notNull().unique(),
  /** What the member called it: "laptop", "Whetstone at home". */
  label: text("label").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [
  index("api_token_person_idx").on(t.personId, t.revokedAt),
]);

export type ApiTokenRow = typeof apiToken.$inferSelect;

export type CardFeedbackKind = "paper" | "peer";
/** `useful`: worth reading. `known`: already knew it, so the match was right
 *  but told the author nothing. `not_relevant`: the match was wrong. */
export type CardFeedbackVerdict = "useful" | "known" | "not_relevant";

/** What a card's owner said about one match the network showed them. One
 *  row per owner, card, and target; a second opinion replaces the first.
 *  `context` keeps the score and blocks the match carried at the time, so a
 *  threshold retune can be judged against what the person actually saw. */
export const cardFeedback = pgTable("card_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id").notNull().references(() => person.id),
  ideaId: text("idea_id").notNull().references(() => forgeCard.ideaId),
  kind: text("kind").$type<CardFeedbackKind>().notNull(),
  /** A `document.id` for a paper, a `forge_card.idea_id` for a peer. */
  targetId: text("target_id").notNull(),
  verdict: text("verdict").$type<CardFeedbackVerdict>().notNull(),
  context: jsonb("context").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("card_feedback_one_opinion").on(t.personId, t.ideaId, t.kind, t.targetId),
  index("card_feedback_target_idx").on(t.kind, t.targetId),
  check("card_feedback_kind_valid", sql`${t.kind} in ('paper', 'peer')`),
  check("card_feedback_verdict_valid", sql`${t.verdict} in ('useful', 'known', 'not_relevant')`),
]);

export type CardFeedbackRow = typeof cardFeedback.$inferSelect;

/** The verdict graph: one row per paper verdict, keyed by the block it
 *  judged, carrying that block's unit-mean vector as it stood when the
 *  person judged. A snapshot on purpose — it stays meaningful after the card
 *  pivots. Written by `recordFeedback`; no ranking reads it yet. A revoked
 *  member's rows stay and are left out at read time. */
export const paperBlockVerdict = pgTable("paper_block_verdict", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => document.id, { onDelete: "cascade" }),
  /** The block key: `value_proposition`, never its label. */
  block: text("block").notNull(),
  ideaId: text("idea_id").notNull().references(() => forgeCard.ideaId),
  personId: uuid("person_id").notNull().references(() => person.id),
  verdict: text("verdict").$type<CardFeedbackVerdict>().notNull(),
  // 1024 is `EMBEDDING_DIMENSIONS`, which `schema.ts` re-exports this file
  // before defining, so it cannot be imported here.
  blockEmbedding: halfvec("block_embedding", { dimensions: 1024 }).notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("paper_block_verdict_one_opinion").on(t.documentId, t.block, t.ideaId, t.personId),
  check("paper_block_verdict_verdict_valid", sql`${t.verdict} in ('useful', 'known', 'not_relevant')`),
]);

export type PaperBlockVerdictRow = typeof paperBlockVerdict.$inferSelect;
