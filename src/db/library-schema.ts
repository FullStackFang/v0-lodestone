import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { person, thesisCard } from "./schema";
import { cardRevision } from "./review-schema";

export const componentReference = pgTable("component_reference", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id").notNull().references(() => person.id),
  cardId: uuid("card_id").notNull().references(() => thesisCard.id),
  revisionId: uuid("revision_id").notNull().references(() => cardRevision.id),
  component: text("component").notNull(),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("component_reference_key").on(t.cardId, t.revisionId, t.component),
  index("component_reference_person_idx").on(t.personId),
  index("component_reference_revision_idx").on(t.revisionId),
]);
