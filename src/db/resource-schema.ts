import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, real, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { person, thesisCard } from "./schema";

export type ResourceKind = "paper" | "patent" | "technology_disclosure";
export type ClaimFacet = "purpose" | "method" | "result" | "conditions" | "limitations" | "equipment" | "access";
export type ResourceClaim = { facet: ClaimFacet; text: string; quote: string; startOff: number; endOff: number };
export type NeedStatus = "active" | "paused" | "resolved";
export type ResourceOutcome = "dismissed" | "helped" | "not_helpful";
export type ResourceExplanation = {
  matchedTerms: string[];
  snippets: ResourceClaim[];
  explanation: string;
  applicability: string[];
  limitations: string[];
  nextAction: string;
};

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const ideaNeeds = pgTable("idea_needs", {
  id: id(),
  cardId: uuid("card_id").notNull().references(() => thesisCard.id),
  personId: uuid("person_id").notNull().references(() => person.id),
  title: text("title").notNull(),
  criteria: text("criteria").notNull(),
  status: text("status").$type<NeedStatus>().notNull().default("active"),
  monitoring: boolean("monitoring").notNull().default(true),
  revision: integer("revision").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
}, (t) => [
  index("idea_needs_owner_idx").on(t.personId, t.status),
  index("idea_needs_card_idx").on(t.cardId),
  check("idea_needs_status_check", sql`${t.status} in ('active', 'paused', 'resolved')`),
]);

export const curatedResources = pgTable("curated_resources", {
  id: id(),
  curatorId: uuid("curator_id").notNull().references(() => person.id),
  kind: text("kind").$type<ResourceKind>().notNull(),
  title: text("title").notNull(),
  sourceUrl: text("source_url").notNull(),
  identifier: text("identifier").notNull(),
  sourceDate: text("source_date").notNull(),
  rawText: text("raw_text").notNull(),
  canonicalText: text("canonical_text").notNull(),
  textHash: text("text_hash").notNull(),
  claims: jsonb("claims").$type<ResourceClaim[]>().notNull(),
  proposals: jsonb("proposals").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: createdAt(),
}, (t) => [
  unique("curated_resources_source_text_key").on(t.sourceUrl, t.textHash),
  index("curated_resources_created_idx").on(t.createdAt),
  index("curated_resources_curator_idx").on(t.curatorId),
  check("curated_resources_kind_check", sql`${t.kind} in ('paper', 'patent', 'technology_disclosure')`),
]);

export const resourceRecommendations = pgTable("resource_recommendations", {
  id: id(),
  needId: uuid("need_id").notNull().references(() => ideaNeeds.id),
  resourceId: uuid("resource_id").notNull().references(() => curatedResources.id),
  needRevision: integer("need_revision").notNull(),
  score: real("score").notNull(),
  explanation: jsonb("explanation").$type<ResourceExplanation>().notNull(),
  outcome: text("outcome").$type<ResourceOutcome>(),
  outcomeNote: text("outcome_note"),
  outcomeAt: timestamp("outcome_at", { withTimezone: true }),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("resource_recommendations_pair_key").on(t.needId, t.resourceId),
  index("resource_recommendations_need_idx").on(t.needId),
  index("resource_recommendations_resource_idx").on(t.resourceId),
  check("resource_recommendations_outcome_check", sql`${t.outcome} is null or ${t.outcome} in ('dismissed', 'helped', 'not_helpful')`),
]);

export type IdeaNeedRow = typeof ideaNeeds.$inferSelect;
export type CuratedResourceRow = typeof curatedResources.$inferSelect;
export type ResourceRecommendationRow = typeof resourceRecommendations.$inferSelect;
