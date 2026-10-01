import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { refreshLease, refreshRun, type RefreshRunRow } from "@/db/operations-schema";
import { assertActiveMember } from "@/pilot/membership";
import { assertPilotOperator, type VerifiedPilotActor } from "@/pilot/membership";
import { refreshResources } from "./service";

const LEASE_MS = 120_000;
const SLOT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export type RefreshRunHandle = {
  runId: string;
  fencingToken: number;
  scope: "global" | "owner";
  ownerId: string | null;
};

function expiry(now: Date) {
  return new Date(now.getTime() + LEASE_MS);
}

function scheduledSlot(value: string, now: Date) {
  const parsed = z.iso.datetime({ offset: true }).parse(value);
  const slot = new Date(parsed);
  if (slot.toISOString() !== value || slot.getUTCHours() !== 2 || slot.getUTCMinutes() !== 0 || slot.getUTCSeconds() !== 0 || slot.getUTCMilliseconds() !== 0) {
    throw new Error("Scheduled slot must be the daily 02:00 UTC instant.");
  }
  if (slot > now) throw new Error("Scheduled slot is in the future.");
  if (now.getTime() - slot.getTime() > SLOT_WINDOW_MS) throw new Error("Scheduled slot is older than seven days.");
  return parsed;
}

export async function startOwnerRefreshRun(db: Db, ownerId: string, now = new Date()): Promise<RefreshRunHandle> {
  await assertActiveMember(db, ownerId);
  const [run] = await db.insert(refreshRun).values({
    trigger: "manual_owner", scope: "owner", ownerId, correlationKey: randomUUID(), attempt: 1,
    fencingToken: 1, startedAt: now, heartbeatAt: now, expiresAt: expiry(now),
  }).returning();
  return { runId: run.id, fencingToken: 1, scope: "owner", ownerId };
}

export async function claimScheduledRun(db: Db, slotValue: string, now = new Date()): Promise<
  { kind: "claimed"; handle: RefreshRunHandle; run: RefreshRunRow }
  | { kind: "busy"; run: RefreshRunRow }
  | { kind: "replayed"; run: RefreshRunRow }
> {
  const slot = scheduledSlot(slotValue, now);
  return db.transaction(async (tx) => {
    const prior = await tx.select().from(refreshRun)
      .where(and(eq(refreshRun.trigger, "scheduled"), eq(refreshRun.correlationKey, slot)))
      .orderBy(desc(refreshRun.attempt));
    const success = prior.find((run) => run.status === "succeeded");
    if (success) return { kind: "replayed" as const, run: success };

    const [lease] = await tx.select().from(refreshLease).where(eq(refreshLease.scope, "global")).for("update");
    if (lease?.runId && lease.expiresAt > now) {
      const [running] = await tx.select().from(refreshRun).where(eq(refreshRun.id, lease.runId));
      if (running?.status === "running") return { kind: "busy" as const, run: running };
    }
    if (lease?.runId) {
      await tx.update(refreshRun).set({ status: "interrupted", errorCode: "lease_expired", finishedAt: now })
        .where(and(eq(refreshRun.id, lease.runId), eq(refreshRun.status, "running")));
    }
    if (prior.length >= 3) throw new Error("Scheduled slot has exhausted three attempts.");
    const token = (lease?.fencingToken ?? 0) + 1;
    const [run] = await tx.insert(refreshRun).values({
      trigger: "scheduled", scope: "global", ownerId: null, correlationKey: slot,
      attempt: prior.length + 1, fencingToken: token, startedAt: now, heartbeatAt: now, expiresAt: expiry(now),
    }).returning();
    await tx.insert(refreshLease).values({ scope: "global", runId: run.id, fencingToken: token, heartbeatAt: now, expiresAt: expiry(now) })
      .onConflictDoUpdate({ target: refreshLease.scope, set: { runId: run.id, fencingToken: token, heartbeatAt: now, expiresAt: expiry(now) } });
    return { kind: "claimed" as const, run, handle: { runId: run.id, fencingToken: token, scope: "global" as const, ownerId: null } };
  });
}

export async function claimManualGlobalRun(db: Db, actor: VerifiedPilotActor, now = new Date()) {
  await assertPilotOperator(actor);
  return db.transaction(async (tx) => {
    const [lease] = await tx.select().from(refreshLease).where(eq(refreshLease.scope, "global")).for("update");
    if (lease?.runId && lease.expiresAt > now) {
      const [running] = await tx.select().from(refreshRun).where(eq(refreshRun.id, lease.runId));
      if (running?.status === "running") return { kind: "busy" as const, run: running };
    }
    if (lease?.runId) {
      await tx.update(refreshRun).set({ status: "interrupted", errorCode: "lease_expired", finishedAt: now })
        .where(and(eq(refreshRun.id, lease.runId), eq(refreshRun.status, "running")));
    }
    const token = (lease?.fencingToken ?? 0) + 1;
    const [run] = await tx.insert(refreshRun).values({
      trigger: "manual_operator", scope: "global", ownerId: null, correlationKey: randomUUID(),
      attempt: 1, fencingToken: token, startedAt: now, heartbeatAt: now, expiresAt: expiry(now),
    }).returning();
    await tx.insert(refreshLease).values({ scope: "global", runId: run.id, fencingToken: token, heartbeatAt: now, expiresAt: expiry(now) })
      .onConflictDoUpdate({ target: refreshLease.scope, set: { runId: run.id, fencingToken: token, heartbeatAt: now, expiresAt: expiry(now) } });
    return { kind: "claimed" as const, run, handle: { runId: run.id, fencingToken: token, scope: "global" as const, ownerId: null } };
  });
}

async function lockAuthorizedRun(db: Db, handle: RefreshRunHandle, now: Date) {
  const [run] = await db.select().from(refreshRun).where(eq(refreshRun.id, handle.runId)).for("update");
  if (!run || run.status !== "running") throw new Error("Refresh run is interrupted or complete.");
  if (run.fencingToken !== handle.fencingToken || run.expiresAt <= now) throw new Error("Refresh run lease expired.");
  if (handle.scope === "global") {
    const [lease] = await db.select().from(refreshLease).where(eq(refreshLease.scope, "global")).for("update");
    if (!lease || lease.runId !== handle.runId || lease.fencingToken !== handle.fencingToken || lease.expiresAt <= now) {
      throw new Error("Global refresh lease is no longer held.");
    }
  }
  return run;
}

function errorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("limit exceeded")) return "capacity_exceeded";
  if (message.includes("Injected")) return "injected_failure";
  if (/lease|interrupted/i.test(message)) return "lease_expired";
  return "refresh_failed";
}

export async function executeRefreshRun(
  db: Db,
  handle: RefreshRunHandle,
  options: { now?: () => Date; failAfterChecked?: number } = {},
) {
  const now = options.now ?? (() => new Date());
  try {
    const summary = await refreshResources(db, {
      personId: handle.ownerId ?? undefined,
      run: {
        now,
        beforeNeed: (completed) => {
          if (options.failAfterChecked !== undefined && completed >= options.failAfterChecked) {
            throw new Error("Injected refresh failure.");
          }
        },
        authorize: async (tx, at) => { await lockAuthorizedRun(tx, handle, at); },
        record: async (tx, progress, at) => {
          const nextExpiry = expiry(at);
          await tx.update(refreshRun).set({
            resources: progress.resources,
            checked: sql`${refreshRun.checked} + ${progress.checked}`,
            created: sql`${refreshRun.created} + ${progress.created}`,
            updated: sql`${refreshRun.updated} + ${progress.updated}`,
            heartbeatAt: at, expiresAt: nextExpiry,
          }).where(eq(refreshRun.id, handle.runId));
          if (handle.scope === "global") {
            await tx.update(refreshLease).set({ heartbeatAt: at, expiresAt: nextExpiry })
              .where(and(eq(refreshLease.scope, "global"), eq(refreshLease.runId, handle.runId), eq(refreshLease.fencingToken, handle.fencingToken)));
          }
        },
      },
    });
    const finished = now();
    await db.transaction(async (tx) => {
      await lockAuthorizedRun(tx as unknown as Db, handle, finished);
      await tx.update(refreshRun).set({
        status: "succeeded", resources: summary.resources, heartbeatAt: finished,
        expiresAt: finished, finishedAt: finished, errorCode: null,
      }).where(eq(refreshRun.id, handle.runId));
      if (handle.scope === "global") {
        await tx.update(refreshLease).set({ heartbeatAt: finished, expiresAt: finished })
          .where(and(eq(refreshLease.scope, "global"), eq(refreshLease.runId, handle.runId), eq(refreshLease.fencingToken, handle.fencingToken)));
      }
    });
    return summary;
  } catch (error) {
    const failedAt = now();
    await db.transaction(async (tx) => {
      await tx.update(refreshRun).set({ status: "failed", errorCode: errorCode(error), finishedAt: failedAt, expiresAt: failedAt })
        .where(and(eq(refreshRun.id, handle.runId), eq(refreshRun.status, "running")));
      if (handle.scope === "global") {
        await tx.update(refreshLease).set({ heartbeatAt: failedAt, expiresAt: failedAt })
          .where(and(eq(refreshLease.scope, "global"), eq(refreshLease.runId, handle.runId), eq(refreshLease.fencingToken, handle.fencingToken)));
      }
    });
    throw error;
  }
}

export async function abandonExpiredRuns(db: Db, now = new Date()) {
  const rows = await db.update(refreshRun).set({ status: "interrupted", errorCode: "lease_expired", finishedAt: now })
    .where(and(eq(refreshRun.status, "running"), lt(refreshRun.expiresAt, now))).returning({ id: refreshRun.id });
  return rows.length;
}

export async function listOwnerRefreshReceipts(db: Db, ownerId: string) {
  return db.select().from(refreshRun).where(and(eq(refreshRun.scope, "owner"), eq(refreshRun.ownerId, ownerId)))
    .orderBy(desc(refreshRun.startedAt));
}

export async function listGlobalRefreshRuns(db: Db) {
  return db.select().from(refreshRun).where(eq(refreshRun.scope, "global")).orderBy(desc(refreshRun.startedAt));
}

export async function operatorRefreshStatus(db: Db, actor: VerifiedPilotActor, now = new Date()) {
  await assertPilotOperator(actor);
  return { health: await refreshHealth(db, now), runs: await listGlobalRefreshRuns(db) };
}

export async function retryGlobalRefreshRun(db: Db, actor: VerifiedPilotActor, runId: string, now = new Date()) {
  await assertPilotOperator(actor);
  const [run] = await db.select().from(refreshRun).where(eq(refreshRun.id, z.uuid().parse(runId))).limit(1);
  if (!run || run.scope !== "global" || run.trigger !== "scheduled" || !["failed", "interrupted"].includes(run.status)) {
    throw new Error("Retryable scheduled refresh run not found.");
  }
  return claimScheduledRun(db, run.correlationKey, now);
}

export async function refreshHealth(db: Db, now = new Date()) {
  await abandonExpiredRuns(db, now);
  const [latest] = await db.select().from(refreshRun).where(eq(refreshRun.scope, "global")).orderBy(desc(refreshRun.startedAt)).limit(1);
  if (!latest) return { state: "never_run" as const, run: null };
  if (latest.status === "running") return { state: "running" as const, run: latest };
  const [success] = await db.select().from(refreshRun)
    .where(and(eq(refreshRun.scope, "global"), eq(refreshRun.status, "succeeded")))
    .orderBy(desc(refreshRun.finishedAt)).limit(1);
  if (success?.finishedAt && now.getTime() - success.finishedAt.getTime() > 26 * 60 * 60 * 1000) {
    return { state: "overdue" as const, run: success };
  }
  return { state: latest.status as "succeeded" | "failed" | "interrupted", run: latest };
}

export async function cleanupRefreshRuns(db: Db, now = new Date()) {
  const cutoff = new Date(now.getTime() - RETENTION_MS);
  await db.update(refreshLease).set({ runId: null }).where(lt(refreshLease.expiresAt, cutoff));
  const rows = await db.delete(refreshRun)
    .where(and(inArray(refreshRun.status, ["succeeded", "failed", "interrupted"]), lt(refreshRun.finishedAt, cutoff)))
    .returning({ id: refreshRun.id });
  return rows.length;
}
