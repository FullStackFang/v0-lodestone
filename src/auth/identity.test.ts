/** The identity bridge: a verified auth session becomes one `session` row
 *  tied to one person, and a request that finds the row already there reads
 *  it without trying to write it again. */
import { beforeAll, describe, expect, it } from "vitest";
import { countingDb, type CountingDb } from "@/lodestone/test-db";
import { verifiedContext } from "./identity";

let h: CountingDb;
beforeAll(async () => { h = await countingDb(); }, 60_000);

const auth = (sessionId: string, email: string, emailVerified = true) => ({
  user: { id: `u-${sessionId}`, email, name: "Ada Bridge", emailVerified },
  session: { id: sessionId },
});

/** The statements a call issues, and the result. */
async function counted<T>(work: () => Promise<T>) {
  const from = h.statements.length;
  const out = await work();
  return { out, statements: h.statements.slice(from) };
}

describe("verifiedContext", () => {
  it("creates the person and the session row on the first call, then only reads", async () => {
    const first = await counted(() => verifiedContext(h.db, auth("auth-1", "Ada@Bridge.edu")));
    expect(first.out?.person.email).toBe("ada@bridge.edu");
    expect(first.statements.some((q) => /^insert into "session"/.test(q))).toBe(true);

    const second = await counted(() => verifiedContext(h.db, auth("auth-1", "Ada@Bridge.edu")));
    expect(second.out).toEqual(first.out);
    expect(second.statements).toHaveLength(1);
    expect(second.statements[0]).toMatch(/^select/);
    expect(second.statements.some((q) => /^insert into "(session|person)"/.test(q))).toBe(false);
  });

  it("gives a second auth session for the same address the same person", async () => {
    const first = await verifiedContext(h.db, auth("auth-1", "ada@bridge.edu"));
    const other = await verifiedContext(h.db, auth("auth-2", " ADA@bridge.edu"));
    expect(other?.person.id).toBe(first?.person.id);
    expect(other?.sessionId).not.toBe(first?.sessionId);
  });

  it("refuses a session row whose auth email has changed", async () => {
    await expect(verifiedContext(h.db, auth("auth-1", "someone@else.edu"))).rejects.toThrow(/ownership mismatch/);
  });

  it("lets nothing unverified in", async () => {
    expect(await verifiedContext(h.db, auth("auth-3", "new@bridge.edu", false))).toBeNull();
    expect(await verifiedContext(h.db, null)).toBeNull();
  });
});
