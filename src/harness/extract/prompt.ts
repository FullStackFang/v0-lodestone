/** Prompt assembly for extraction, by the same rule `assemblePrompt` uses
 *  for a turn: the version is the sha256 of the *effective* text, so what
 *  the run received and what the fingerprint names cannot diverge.
 *
 *  `core_version` is stored beside it so "every run at core v3, whatever the
 *  variant" is a `WHERE` rather than a join. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "prompts", "extract");
const JOIN = "\n\n---\n\n";

const cache = new Map<string, string>();

/** Read once per process, uncached under test so an edit between two
 *  assertions is seen — the same rule as `readPrompt`. */
function readExtractPrompt(name: string): string {
  if (!process.env.VITEST && cache.has(name)) return cache.get(name)!;
  const file = path.join(DIR, `${name}.md`);
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(`no extraction prompt at prompts/extract/${name}.md`);
  }
  const normalized = text.replace(/\r\n/g, "\n");
  cache.set(name, normalized);
  return normalized;
}

export interface AssembledExtractPrompt {
  /** System blocks in order: the shared core, then the variant. The ladder
   *  has no core — it is a pass over rows, not over a text. */
  blocks: string[];
  /** The whole system prompt, for an engine that takes one string. */
  system: string;
  promptVersion: string;
  coreVersion: string;
}

const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

export function assembleExtractPrompt(variant: string): AssembledExtractPrompt {
  if (variant === "ladder") {
    const ladder = readExtractPrompt("ladder");
    const hash = sha(ladder);
    return { blocks: [ladder], system: ladder, promptVersion: hash, coreVersion: hash };
  }
  const core = readExtractPrompt("core");
  const module = readExtractPrompt(variant);
  return {
    blocks: [core, module],
    system: core + JOIN + module,
    promptVersion: sha(core + JOIN + module),
    coreVersion: sha(core),
  };
}
