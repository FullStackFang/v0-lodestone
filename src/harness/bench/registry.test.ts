import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { type BenchName, BENCHES, benchFile, isBenchName, loadBench } from "./registry";

/** Run the dispatcher and report what it printed and what it exited with. */
function bench(args: string[]): { out: string; code: number } {
  try {
    const out = execFileSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["tsx", "scripts/harness/bench.mts", ...args],
      { cwd: process.cwd(), encoding: "utf8", shell: process.platform === "win32", stdio: "pipe" },
    );
    return { out, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { out: `${e.stdout ?? ""}${e.stderr ?? ""}`, code: e.status ?? -1 };
  }
}

describe("the registry", () => {
  it("claims all six names", () => {
    expect([...BENCHES]).toEqual(["vocab", "gold", "coda", "silver", "final", "pairs"]);
  });

  it("knows a name from a typo", () => {
    expect(isBenchName("pairs")).toBe(true);
    expect(isBenchName("nonesuch")).toBe(false);
  });

  it("loads an implementation that exists and returns null for one that does not", async () => {
    expect(existsSync(benchFile("vocab"))).toBe(true);
    expect(typeof (await loadBench("vocab"))).toBe("function");

    // Deliberately not a real bench. Naming one of the six here would make
    // this assertion false the day its track lands — which is what the
    // pre-claimed registry exists to make easy. The cast says the name is the
    // test's own and will never be registered.
    const absent = "neverlanded" as BenchName;
    expect(existsSync(benchFile(absent))).toBe(false);
    expect(await loadBench(absent)).toBeNull();
    expect(benchFile(absent)).toBe(path.join(path.dirname(benchFile("vocab")), "neverlanded.ts"));
  });

  it("loads every landed bench as a function", async () => {
    // States what landing looks like, so the suite goes green on a track
    // arriving rather than red.
    for (const name of BENCHES) {
      if (!existsSync(benchFile(name))) continue;
      expect(typeof (await loadBench(name))).toBe("function");
    }
  });
});

describe("the dispatcher", () => {
  // The exit-2 path has no CLI test on purpose. It needs a name that is
  // registered *and* absent, and every registered name now has a file; a
  // synthetic name is rejected at exit 1 before the branch is ever reached,
  // which would test the wrong thing. The rule is asserted where it lives,
  // against `loadBench` above.

  it("lists the registry and exits 1 for an unknown name", () => {
    const { out, code } = bench(["nonesuch"]);
    expect(out).toContain("unknown bench nonesuch");
    for (const name of BENCHES) expect(out).toContain(name);
    expect(code).toBe(1);
  }, 60_000);

  it("exits 1 with the registry when given no name at all", () => {
    const { out, code } = bench([]);
    expect(out).toContain("usage: npm run bench");
    expect(code).toBe(1);
  }, 60_000);
});
