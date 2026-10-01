import { beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { createCard, createSession } from "@/db/cards";
import { ensurePerson } from "@/harness/ledger";
import { enrollTestMember } from "@/pilot/test-fixtures";
import { createNeed } from "./service";
import {
  abandonExpiredRuns,
  claimScheduledRun,
  cleanupRefreshRuns,
  executeRefreshRun,
  listGlobalRefreshRuns,
  listOwnerRefreshReceipts,
  refreshHealth,
  startOwnerRefreshRun,
} from "./refresh-runs";

const minute = 60_000;
let db: Db;
let owner: string;

beforeEach(async () => {
  db = await createPgliteDb();
  owner = await ensurePerson(db, { name: "Refresh owner", email: "refresh-owner@example.test" });
  await enrollTestMember(db, owner);
  const card = await createCard(db, { sessionId: await createSession(db, owner), door: "blank" });
  for (const title of ["alpha", "beta", "gamma"]) {
    await createNeed(db, owner, { cardId: card.id, title, criteria: "matching criteria", monitoring: true });
  }
});

describe("durable refresh runs", () => {
  it("accepts only occurred daily slots within seven days and replays success as a no-op", async () => {
    const now = new Date("2026-09-06T03:00:00.000Z");
    await expect(claimScheduledRun(db, "2026-09-07T02:00:00.000Z", now)).rejects.toThrow(/future/);
    await expect(claimScheduledRun(db, "2026-08-29T02:00:00.000Z", now)).rejects.toThrow(/seven days/);
    const claim = await claimScheduledRun(db, "2026-09-06T02:00:00.000Z", now);
    expect(claim.kind).toBe("claimed");
    if (claim.kind !== "claimed") throw new Error("expected claim");
    await executeRefreshRun(db, claim.handle, { now: () => now });
    const replay = await claimScheduledRun(db, "2026-09-06T02:00:00.000Z", new Date(now.getTime() + minute));
    expect(replay).toMatchObject({ kind: "replayed", run: { status: "succeeded", attempt: 1 } });
  });

  it("fences overlapping global workers and interrupts an expired holder", async () => {
    const now = new Date("2026-09-06T03:00:00.000Z");
    const first = await claimScheduledRun(db, "2026-09-06T02:00:00.000Z", now);
    expect((await claimScheduledRun(db, "2026-09-05T02:00:00.000Z", now)).kind).toBe("busy");
    const recovered = await claimScheduledRun(db, "2026-09-05T02:00:00.000Z", new Date(now.getTime() + 121_000));
    expect(recovered.kind).toBe("claimed");
    if (first.kind !== "claimed" || recovered.kind !== "claimed") throw new Error("expected claims");
    await expect(executeRefreshRun(db, first.handle, { now: () => new Date(now.getTime() + 121_000) })).rejects.toThrow(/lease|interrupted/i);
    expect((await listOwnerRefreshReceipts(db, owner))).toEqual([]);
  });

  it("serializes two workers claiming the same scheduled slot", async () => {
    const now = new Date("2026-09-06T03:00:00.000Z");
    const claims = await Promise.all([
      claimScheduledRun(db, "2026-09-06T02:00:00.000Z", now),
      claimScheduledRun(db, "2026-09-06T02:00:00.000Z", now),
    ]);
    expect(claims.map((claim) => claim.kind).sort()).toEqual(["busy", "claimed"]);
  });

  it("preserves partial progress, bounds retries, and sanitizes failures", async () => {
    const now = new Date("2026-09-06T03:00:00.000Z");
    const slot = "2026-09-06T02:00:00.000Z";
    for (let attempt = 1; attempt <= 3; attempt++) {
      const claim = await claimScheduledRun(db, slot, new Date(now.getTime() + attempt * minute));
      if (claim.kind !== "claimed") throw new Error("expected claim");
      await expect(executeRefreshRun(db, claim.handle, {
        now: () => new Date(now.getTime() + attempt * minute),
        failAfterChecked: 2,
      })).rejects.toThrow(/injected/i);
      expect(claim.handle.runId).not.toContain("matching criteria");
      const latest = (await listGlobalRefreshRuns(db)).find((run) => run.id === claim.handle.runId);
      expect(latest).toMatchObject({ status: "failed", checked: 2, errorCode: "injected_failure" });
    }
    await expect(claimScheduledRun(db, slot, new Date(now.getTime() + 4 * minute))).rejects.toThrow(/three attempts/);
  });

  it("abandons manual work after 120 seconds and rejects its stale worker", async () => {
    const now = new Date("2026-09-06T03:00:00.000Z");
    const handle = await startOwnerRefreshRun(db, owner, now);
    expect(await abandonExpiredRuns(db, new Date(now.getTime() + 121_000))).toBe(1);
    await expect(executeRefreshRun(db, handle, { now: () => new Date(now.getTime() + 121_000) })).rejects.toThrow(/interrupted/);
    const [receipt] = await listOwnerRefreshReceipts(db, owner);
    expect(receipt).toMatchObject({ status: "interrupted", checked: 0, errorCode: "lease_expired" });
  });

  it("reports never-run and overdue health and removes only records older than 90 days", async () => {
    const now = new Date("2026-09-06T03:00:00.000Z");
    expect(await refreshHealth(db, now)).toMatchObject({ state: "never_run" });
    const claim = await claimScheduledRun(db, "2026-09-06T02:00:00.000Z", now);
    if (claim.kind !== "claimed") throw new Error("expected claim");
    await executeRefreshRun(db, claim.handle, { now: () => now });
    expect(await refreshHealth(db, new Date(now.getTime() + 27 * 60 * minute))).toMatchObject({ state: "overdue" });
    expect(await cleanupRefreshRuns(db, new Date(now.getTime() + 89 * 24 * 60 * minute))).toBe(0);
    expect(await cleanupRefreshRuns(db, new Date(now.getTime() + 91 * 24 * 60 * minute))).toBe(1);
  });
});
