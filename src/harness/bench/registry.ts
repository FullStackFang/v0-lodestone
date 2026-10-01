/** The six bench names, claimed here so neither track has to add one.
 *
 * A track adds an *implementation* under `src/harness/bench/<name>.ts`; it
 * never edits this list. That is the whole point: two branches editing one
 * registry is a merge conflict the contract can remove by claiming the
 * ground first. */
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Db } from "@/db/client";

export const BENCHES = ["vocab", "gold", "coda", "silver", "final", "pairs"] as const;
export type BenchName = (typeof BENCHES)[number];

export interface BenchContext {
  args: string[];
  /** Injected by a test; the dispatcher leaves it unset and the bench
   *  opens the app database itself. */
  db?: Db;
}

/** Every bench is `(ctx) => Promise<void>`; it prints its own console lines
 *  and appends its own results row. */
export type BenchFn = (ctx: BenchContext) => Promise<void>;

export function isBenchName(name: string): name is BenchName {
  return (BENCHES as readonly string[]).includes(name);
}

/** Where a bench's implementation lives, if it has one. The path is built
 *  rather than mapped so a track lands a file and nothing else. */
export function benchFile(name: BenchName): string {
  return path.join(import.meta.dirname, `${name}.ts`);
}

/** Load a bench's implementation, or null when the track that owns it has
 *  not landed yet. */
export async function loadBench(name: BenchName): Promise<BenchFn | null> {
  const file = benchFile(name);
  if (!existsSync(file)) return null;
  const module = (await import(pathToFileURL(file).href)) as { run?: BenchFn };
  return module.run ?? null;
}
