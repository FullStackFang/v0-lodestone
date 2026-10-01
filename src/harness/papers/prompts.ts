/** The harness's own prompts — the ones that are not extraction variants.
 *
 * Same rule as the contract's `assembleExtractPrompt`: the version is the
 * sha256 of the *effective* text, so what a call received and what the row
 * says it received cannot diverge. Read uncached under test, so an edit
 * between two assertions is seen. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "prompts", "harness");

const cache = new Map<string, { system: string; promptVersion: string }>();

export function harnessPrompt(name: string): { system: string; promptVersion: string } {
  if (!process.env.VITEST && cache.has(name)) return cache.get(name)!;
  let text: string;
  try {
    text = readFileSync(path.join(DIR, `${name}.md`), "utf8");
  } catch {
    throw new Error(`no harness prompt at prompts/harness/${name}.md`);
  }
  const system = text.replace(/\r\n/g, "\n");
  const assembled = {
    system,
    promptVersion: createHash("sha256").update(system, "utf8").digest("hex"),
  };
  cache.set(name, assembled);
  return assembled;
}
