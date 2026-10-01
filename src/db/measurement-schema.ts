import { sql } from "drizzle-orm";
import { check, date, index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { person } from "./schema";

export const pilotMeasurementConsent = pgTable("pilot_measurement_consent", {
  personId: uuid("person_id").primaryKey().references(() => person.id),
  status: text("status").$type<"consented" | "declined" | "withdrawn">().notNull(),
  noticeVersion: text("notice_version").notNull(),
  decisionAt: timestamp("decision_at", { withTimezone: true }).notNull(),
  consentedAt: timestamp("consented_at", { withTimezone: true }),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
}, (t) => [
  index("pilot_measurement_status_idx").on(t.status, t.consentedAt),
  check("pilot_measurement_status_check", sql`
    (${t.status} = 'consented' and ${t.consentedAt} is not null and ${t.withdrawnAt} is null)
    or (${t.status} = 'declined' and ${t.consentedAt} is null and ${t.withdrawnAt} is null)
    or (${t.status} = 'withdrawn' and ${t.consentedAt} is not null and ${t.withdrawnAt} is not null)
  `),
]);

export const pilotDailyActivity = pgTable("pilot_daily_activity", {
  personId: uuid("person_id").notNull().references(() => pilotMeasurementConsent.personId),
  activityDate: date("activity_date", { mode: "string" }).notNull(),
}, (t) => [primaryKey({ columns: [t.personId, t.activityDate], name: "pilot_daily_activity_person_day_pk" })]);

export type PilotMeasurementConsent = typeof pilotMeasurementConsent.$inferSelect;
