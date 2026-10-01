import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { matchResults, person } from "./schema";

export const AVAILABILITIES = ["unavailable", "exploring", "part_time", "full_time"] as const;
export const MATCHING_INTENTS = ["cofounder", "collaborator"] as const;
export type Availability = (typeof AVAILABILITIES)[number];
export type MatchingIntent = (typeof MATCHING_INTENTS)[number];

export const founderPreferences = pgTable("founder_preferences", {
  personId: uuid("person_id").primaryKey().references(() => person.id),
  discoverable: boolean("discoverable").notNull().default(false),
  availability: text("availability").$type<Availability>().notNull().default("unavailable"),
  intent: text("intent").$type<MatchingIntent>().notNull().default("cofounder"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("founder_availability_valid", sql`${t.availability} in ('unavailable', 'exploring', 'part_time', 'full_time')`),
  check("founder_intent_valid", sql`${t.intent} in ('cofounder', 'collaborator')`),
]);

export const founderIntroductions = pgTable("founder_introductions", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchResultId: uuid("match_result_id").notNull().references(() => matchResults.id),
  requesterId: uuid("requester_id").notNull().references(() => person.id),
  recipientId: uuid("recipient_id").notNull().references(() => person.id),
  status: text("status").$type<"pending" | "accepted" | "declined" | "cancelled">().notNull().default("pending"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancellationReason: text("cancellation_reason"),
}, (t) => [
  uniqueIndex("founder_introductions_pending_pair").on(
    sql`least(${t.requesterId}, ${t.recipientId})`,
    sql`greatest(${t.requesterId}, ${t.recipientId})`,
  ).where(sql`${t.status} = 'pending'`),
  index("founder_introductions_recipient_idx").on(t.recipientId, t.requestedAt),
  index("founder_introductions_match_idx").on(t.matchResultId),
  check("founder_introduction_status_valid", sql`${t.status} in ('pending', 'accepted', 'declined', 'cancelled')`),
  check("founder_introduction_not_self", sql`${t.requesterId} <> ${t.recipientId}`),
  check("founder_introduction_response_valid", sql`
    (${t.status} = 'pending' and ${t.respondedAt} is null and ${t.cancelledAt} is null and ${t.cancellationReason} is null)
    or (${t.status} in ('accepted', 'declined') and ${t.respondedAt} is not null and ${t.cancelledAt} is null and ${t.cancellationReason} is null)
    or (${t.status} = 'cancelled' and ${t.respondedAt} is null and ${t.cancelledAt} is not null and length(trim(${t.cancellationReason})) > 0)
  `),
]);

export type FounderPreferences = typeof founderPreferences.$inferSelect;
export type FounderIntroduction = typeof founderIntroductions.$inferSelect;
