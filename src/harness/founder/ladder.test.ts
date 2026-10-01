/** One ladder, and this track may only climb the first rung of it.
 *
 * `repeated` is earned across sources; `corroborated` is written by the
 * reading surface when someone *else* annotates you; `confirmed` is the
 * founder's own edit on `/me` and nothing else. The greps are the guard: a
 * future adapter that writes either literal fails here rather than in a
 * cohort's record. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { ensurePerson, insertAssertion, upgradeConfidence } from "@/harness/ledger";

let db: Db;

beforeAll(async () => {
  db = await createPgliteDb();
});

function walk(dir: string): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    // Fixture setup and expected render data do not write production confidence.
    else if (/\.(ts|tsx)$/.test(p) && !/\.(test|spec)\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const SRC = path.join(process.cwd(), "src");

describe("the founder ladder", () => {
  it("upgrades a person to repeated when a different source says it again", async () => {
    const personId = await ensurePerson(db, { name: "Repeat", email: "repeat@ladder.edu" });
    const row = await insertAssertion(db, {
      subjectType: "person",
      subjectId: personId,
      facet: "mechanism_commanded",
      text: "shipped three iOS apps",
      sourceType: "conversation",
      provenance: { kind: "conversation", stage_event_id: "event-one" },
    });
    const upgraded = await upgradeConfidence(db, row.id, "repeated", { stageEventId: "event-two" });
    expect(upgraded.confidence).toBe("repeated");
    expect((upgraded.provenance as Record<string, unknown>).repeated_by).toBe("event-two");
  });

  it("refuses a repeat cited to the row's own source", async () => {
    const personId = await ensurePerson(db, { name: "Same", email: "same@ladder.edu" });
    const row = await insertAssertion(db, {
      subjectType: "person",
      subjectId: personId,
      facet: "mechanism_commanded",
      text: "ran dental procurement",
      sourceType: "conversation",
      provenance: { kind: "conversation", stage_event_id: "one-event" },
    });
    await expect(
      upgradeConfidence(db, row.id, "repeated", { stageEventId: "one-event" }),
    ).rejects.toThrow(/different source/);
  });

  // A *write* is `confidence: "x"` or a rung handed to `upgradeConfidence`.
  // Reading one back — `/me` labels every row with its rung — is not a
  // write, and a grep that cannot tell the two apart would forbid showing
  // the founder what the ladder says about them.
  const writes = (rung: string) =>
    new RegExp(`confidence:\\s*["']${rung}["']|upgradeConfidence\\([^)]*["']${rung}["']`);

  it("writes the literal \"confirmed\" only in the /me edit action", () => {
    const files = [...walk(path.join(SRC, "harness", "founder")), ...walk(path.join(SRC, "app", "me"))];
    const offenders = files.filter(
      (f) =>
        writes("confirmed").test(readFileSync(f, "utf8")) &&
        !/[\\/]app[\\/]me[\\/]actions(\.test)?\.tsx?$/.test(f) &&
        !/[\\/]founder[\\/]ladder\.test\.ts$/.test(f),
    );
    expect(offenders).toEqual([]);
  });

  it("never writes corroborated — that is the reader's word, not ours", () => {
    const files = [...walk(path.join(SRC, "harness", "founder")), ...walk(path.join(SRC, "app", "me"))];
    const offenders = files.filter(
      (f) =>
        writes("corroborated").test(readFileSync(f, "utf8")) &&
        !/[\\/]founder[\\/]ladder\.test\.ts$/.test(f),
    );
    expect(offenders).toEqual([]);
  });
});
