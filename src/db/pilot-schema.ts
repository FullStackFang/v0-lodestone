import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { person } from "./schema";

export type PilotInvitationStatus = "pending" | "accepted" | "revoked";
export type PilotDeliveryStatus = "pending" | "sent" | "failed";
export type PilotMembershipStatus = "active" | "revoked";
export type PilotMemberKind = "participant" | "operator" | "test";

export const pilotInvitation = pgTable("pilot_invitation", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  noticeVersion: text("notice_version").notNull(),
  memberKind: text("member_kind").$type<PilotMemberKind>().notNull().default("participant"),
  status: text("status").$type<PilotInvitationStatus>().notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  acceptedPersonId: uuid("accepted_person_id").references(() => person.id),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  deliveryStatus: text("delivery_status").$type<PilotDeliveryStatus>().notNull().default("pending"),
  deliveryAttemptedAt: timestamp("delivery_attempted_at", { withTimezone: true }),
  deliveryErrorCode: text("delivery_error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("pilot_invitation_email_status_idx").on(t.email, t.status),
  check("pilot_invitation_email_normalized", sql`${t.email} = lower(trim(${t.email}))`),
  check("pilot_invitation_status_valid", sql`${t.status} in ('pending', 'accepted', 'revoked')`),
  check("pilot_invitation_member_kind_valid", sql`${t.memberKind} in ('participant', 'operator', 'test')`),
  check("pilot_invitation_delivery_valid", sql`${t.deliveryStatus} in ('pending', 'sent', 'failed')`),
  check("pilot_invitation_expiry_valid", sql`${t.expiresAt} > ${t.createdAt}`),
  check("pilot_invitation_lifecycle_valid", sql`
    (${t.status} = 'pending' and ${t.acceptedAt} is null and ${t.acceptedPersonId} is null and ${t.revokedAt} is null)
    or (${t.status} = 'accepted' and ${t.acceptedAt} is not null and ${t.acceptedPersonId} is not null and ${t.revokedAt} is null)
    or (${t.status} = 'revoked' and ${t.acceptedAt} is null and ${t.acceptedPersonId} is null and ${t.revokedAt} is not null)
  `),
]);

export const pilotMembership = pgTable("pilot_membership", {
  personId: uuid("person_id").primaryKey().references(() => person.id),
  invitationId: uuid("invitation_id").notNull().unique().references(() => pilotInvitation.id),
  status: text("status").$type<PilotMembershipStatus>().notNull().default("active"),
  memberKind: text("member_kind").$type<PilotMemberKind>().notNull().default("participant"),
  noticeVersion: text("notice_version").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("pilot_membership_status_idx").on(t.status, t.personId),
  check("pilot_membership_status_valid", sql`${t.status} in ('active', 'revoked')`),
  check("pilot_membership_kind_valid", sql`${t.memberKind} in ('participant', 'operator', 'test')`),
  check("pilot_membership_lifecycle_valid", sql`
    (${t.status} = 'active' and ${t.revokedAt} is null)
    or (${t.status} = 'revoked' and ${t.revokedAt} is not null)
  `),
]);

export type PilotInvitation = typeof pilotInvitation.$inferSelect;
export type PilotMembership = typeof pilotMembership.$inferSelect;
