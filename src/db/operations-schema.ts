import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { person } from "./schema";

export type RefreshTrigger = "scheduled" | "manual_owner" | "manual_operator";
export type RefreshScope = "global" | "owner";
export type RefreshStatus = "running" | "succeeded" | "failed" | "interrupted";

export const refreshRun = pgTable("refresh_run", {
  id: uuid("id").primaryKey().defaultRandom(),
  trigger: text("trigger").$type<RefreshTrigger>().notNull(),
  scope: text("scope").$type<RefreshScope>().notNull(),
  ownerId: uuid("owner_id").references(() => person.id),
  correlationKey: text("correlation_key").notNull(),
  attempt: integer("attempt").notNull(),
  fencingToken: integer("fencing_token").notNull(),
  status: text("status").$type<RefreshStatus>().notNull().default("running"),
  resources: integer("resources").notNull().default(0),
  checked: integer("checked").notNull().default(0),
  created: integer("created").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  errorCode: text("error_code"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => [
  unique("refresh_run_correlation_attempt_key").on(t.trigger, t.correlationKey, t.attempt),
  index("refresh_run_global_history_idx").on(t.scope, t.startedAt),
  index("refresh_run_owner_history_idx").on(t.ownerId, t.startedAt),
  check("refresh_run_trigger_check", sql`${t.trigger} in ('scheduled', 'manual_owner', 'manual_operator')`),
  check("refresh_run_scope_check", sql`${t.scope} in ('global', 'owner')`),
  check("refresh_run_status_check", sql`${t.status} in ('running', 'succeeded', 'failed', 'interrupted')`),
  check("refresh_run_scope_owner_check", sql`(${t.scope} = 'owner' and ${t.ownerId} is not null) or (${t.scope} = 'global' and ${t.ownerId} is null)`),
  check("refresh_run_attempt_check", sql`${t.attempt} between 1 and 3`),
  check("refresh_run_progress_check", sql`${t.resources} >= 0 and ${t.checked} >= 0 and ${t.created} >= 0 and ${t.updated} >= 0`),
]);

export const refreshLease = pgTable("refresh_lease", {
  scope: text("scope").primaryKey(),
  runId: uuid("run_id").references(() => refreshRun.id),
  fencingToken: integer("fencing_token").notNull(),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [
  check("refresh_lease_scope_check", sql`${t.scope} = 'global'`),
]);

export type RefreshRunRow = typeof refreshRun.$inferSelect;
