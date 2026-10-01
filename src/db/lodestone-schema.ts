import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { person } from "./schema";

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
