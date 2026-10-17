/** No Lodestone request calls a model, so no Lodestone module may load one:
 *  the SDK and the CLI shim cost every server function its cold start, and
 *  the shim's filesystem probing drags the whole project into the trace.
 *  Two proofs. The static walk covers every module under the network's
 *  directories; the throwing mock proves the walk's reading of the graph on
 *  three entry points vitest actually evaluates. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/harness/model", () => {
  throw new Error("model reached");
});

const SRC = path.resolve(import.meta.dirname, "..");
const ROOTS = ["lodestone", "app/lodestone", "app/api/lodestone", "db"].map((d) => path.join(SRC, d));
// Every page renders under these, so they are on every route's path too.
const ALSO = ["app/layout.tsx", "lib/session.ts"].map((f) => path.join(SRC, f));
const FORBIDDEN_FILES = ["harness/model.ts", "engine/cli-model.ts"].map((f) => path.join(SRC, f));
const FORBIDDEN_PACKAGES = ["@anthropic-ai/sdk"];

const shipped = (f: string) => /\.(ts|tsx|mts)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f);

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true }).map((f) => path.join(dir, String(f))).filter((f) => statSync(f).isFile() && shipped(f));
}

/** Value imports and re-exports, dynamic imports and `import type` left out:
 *  a dynamic import loads only when its line runs, a type-only one never. */
function specifiers(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const out: string[] = [];
  for (const m of text.matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?["']([^"']+)["']/gm)) out.push(m[1]);
  return out;
}

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, path.join(base, "index.ts")]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Try the next spelling.
    }
  }
  return null;
}

/** The first forbidden module each root reaches, with the path to it. */
function violations(roots: string[]): string[] {
  const bad: string[] = [];
  const parent = new Map<string, string | null>();
  const queue: string[] = [];
  for (const r of roots) if (!parent.has(r)) (parent.set(r, null), queue.push(r));
  const trail = (file: string) => {
    const steps = [];
    for (let at: string | null = file; at; at = parent.get(at) ?? null) steps.unshift(path.relative(SRC, at));
    return steps.join(" → ");
  };
  while (queue.length) {
    const file = queue.shift()!;
    for (const spec of specifiers(file)) {
      if (FORBIDDEN_PACKAGES.some((p) => spec === p || spec.startsWith(`${p}/`))) {
        bad.push(`${trail(file)} → ${spec}`);
        continue;
      }
      const target = resolve(file, spec);
      if (!target || parent.has(target)) continue;
      parent.set(target, file);
      if (FORBIDDEN_FILES.includes(target)) bad.push(trail(target));
      else queue.push(target);
    }
  }
  return bad;
}

describe("the network's import graph", () => {
  it("reaches no model module from any file under the network's directories", () => {
    const roots = [...ROOTS.flatMap(filesUnder), ...ALSO];
    expect(roots.length).toBeGreaterThan(20);
    expect(violations(roots)).toEqual([]);
  });

  it("would see the edge if there were one", () => {
    expect(violations([path.join(SRC, "harness/extract/core.ts")]).length).toBeGreaterThan(0);
  });

  it("imports the card, vector and client modules without evaluating the model", async () => {
    await expect(import("@/lodestone/cards")).resolves.toBeDefined();
    await expect(import("@/lodestone/vectors")).resolves.toBeDefined();
    await expect(import("@/app/api/lodestone/client")).resolves.toBeDefined();
  });
});
