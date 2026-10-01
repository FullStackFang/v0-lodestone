import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { CardFields, EvidenceType } from "@/schema/card";
import { person, thesisCard } from "./schema";

export const cardRevision = pgTable("card_revision", {
  id: uuid("id").primaryKey().defaultRandom(),
  cardId: uuid("card_id").notNull().references(() => thesisCard.id),
  ownerId: uuid("owner_id").notNull().references(() => person.id),
  version: integer("version").notNull(),
  fields: jsonb("fields").notNull().$type<CardFields>(),
  visibility: text("visibility").notNull().$type<"unlisted" | "cohort">(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [
  unique("card_revision_version_key").on(t.cardId, t.version),
  index("card_revision_owner_idx").on(t.ownerId),
  check("card_revision_visibility", sql`${t.visibility} in ('unlisted', 'cohort')`),
]);

export const cardReview = pgTable("card_review", {
  id: uuid("id").primaryKey().defaultRandom(),
  revisionId: uuid("revision_id").notNull().references(() => cardRevision.id),
  reviewerId: uuid("reviewer_id").notNull().references(() => person.id),
  component: text("component").notNull(),
  kind: text("kind").notNull().$type<"challenge" | "evidence" | "test" | "help">(),
  text: text("text").notNull(),
  disposition: text("disposition").$type<"addressed" | "deferred" | "disagreed">(),
  response: text("response"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
}, (t) => [
  index("card_review_revision_idx").on(t.revisionId),
  index("card_review_reviewer_idx").on(t.reviewerId),
  check("card_review_kind", sql`${t.kind} in ('challenge', 'evidence', 'test', 'help')`),
  check("card_review_disposition", sql`${t.disposition} is null or ${t.disposition} in ('addressed', 'deferred', 'disagreed')`),
]);

export const ideaExperiment = pgTable("idea_experiment", {
  id: uuid("id").primaryKey().defaultRandom(),
  cardId: uuid("card_id").notNull().references(() => thesisCard.id),
  revisionId: uuid("revision_id").references(() => cardRevision.id),
  ownerId: uuid("owner_id").notNull().references(() => person.id),
  hypothesis: text("hypothesis").notNull(),
  method: text("method").notNull(),
  criterion: text("criterion").notNull(),
  status: text("status").notNull().default("planned").$type<"planned" | "running" | "complete">(),
  result: text("result"),
  evidenceType: text("evidence_type").$type<EvidenceType>(),
  shareResult: boolean("share_result").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idea_experiment_card_idx").on(t.cardId),
  index("idea_experiment_owner_idx").on(t.ownerId),
  index("idea_experiment_revision_idx").on(t.revisionId),
  check("idea_experiment_status", sql`${t.status} in ('planned', 'running', 'complete')`),
  check("idea_experiment_result", sql`${t.status} <> 'complete' or (${t.result} is not null and length(trim(${t.result})) > 0 and ${t.evidenceType} is not null)`),
  check("idea_experiment_evidence", sql`${t.evidenceType} is null or ${t.evidenceType} in ('observed_behavior', 'incurred_cost', 'stated_opinion', 'model_inference')`),
]);

export type CardRevisionRow = typeof cardRevision.$inferSelect;
export type CardReviewRow = typeof cardReview.$inferSelect;
export type IdeaExperimentRow = typeof ideaExperiment.$inferSelect;
