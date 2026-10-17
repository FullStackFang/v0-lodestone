/** The Claude Code CLI as a model — key-free, riding the developer's login,
 *  the way the pack's lab and Forge itself run. Local dev and the eval
 *  harness use this by default; production sets `ANTHROPIC_API_KEY` and gets
 *  the API. Same `ModelFn` contract: a schema-valid TurnOutput or a throw.
 *
 *  The CLI is one prompt, not a message list, so the thread is flattened
 *  into a transcript the way the lab did it. `--json-schema` makes the CLI
 *  validate and return `structured_output`; the Zod parse here is the
 *  second, authoritative check. */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { DEFAULT_EFFORT, DEFAULT_MODEL, TurnOutput, type ModelFn, type ModelRequest } from "./turn";

const TIMEOUT_MS = 300_000;

let resolvedExe: string | undefined;

/** The real executable, never the `.cmd` shim: a shim needs a shell, and a
 *  shell would re-parse the JSON schema on the command line. On Windows the
 *  npm shim sits beside `node_modules/@anthropic-ai/claude-code/bin/claude.exe`
 *  (Forge's Rust engine resolves it the same way). */
export function resolveClaudeExe(): string {
  if (resolvedExe) return resolvedExe;
  const override = process.env.CLAUDE_CLI?.trim();
  if (override) return (resolvedExe = override);
  if (process.platform !== "win32") return (resolvedExe = "claude");
  const dirs = (process.env.PATH ?? "").split(path.delimiter);
  for (const dir of dirs) {
    for (const name of ["claude.exe", "claude.cmd"]) {
      const shim = path.join(/* turbopackIgnore: true */ dir, name);
      if (!existsSync(shim)) continue;
      if (name === "claude.exe") return (resolvedExe = shim);
      const nested = path.join(/* turbopackIgnore: true */ dir, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
      if (existsSync(nested)) return (resolvedExe = nested);
    }
  }
  throw new Error("claude CLI not found on PATH (set CLAUDE_CLI to the executable)");
}

/** Spawn, feed stdin, collect both streams. Resolves on exit whatever the
 *  code; the caller reads the envelope. Rejects only on spawn failure or
 *  timeout. */
function run(exe: string, args: string[], input: string, opts: { cwd: string; env: NodeJS.ProcessEnv }) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(exe, args, { ...opts, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`claude timed out after ${TIMEOUT_MS / 1000}s`));
    }, TIMEOUT_MS);
    child.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
    child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(input, "utf8");
  });
}

function blockText(content: Anthropic.MessageParam["content"]): string {
  if (typeof content === "string") return content;
  return content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
}

/** FOUNDER / THESIS FORGE transcript, ending on the turn to answer. */
export function flatten(messages: Anthropic.MessageParam[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    parts.push(m.role === "user" ? "FOUNDER:\n" : "THESIS FORGE:\n");
    parts.push(blockText(m.content), "\n\n");
  }
  parts.push("THESIS FORGE (reply as the JSON object the schema describes):");
  return parts.join("");
}

/** The CLI validates the schema with a draft-07 validator that rejects a
 *  2020-12 `$schema` key outright, so emit draft-7 and drop the key. */
export function cliSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(TurnOutput, { target: "draft-7" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

/** No API key reaches the child — that is the point — and thinking is off:
 *  the lab measured it as the main latency driver at no gain on this task. */
function cliEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  env.MAX_THINKING_TOKENS ??= "0";
  return env;
}

export interface CliEnvelope {
  is_error?: boolean;
  result?: unknown;
  structured_output?: unknown;
  usage?: Record<string, unknown>;
}

/** One `claude -p` call: a system prompt (via file — the command line is
 *  short on Windows), a prompt on stdin, an optional output schema. Returns
 *  the CLI's JSON envelope; throws when there is none or it says error. */
export async function runClaudeCli(input: {
  system: string;
  prompt: string;
  model: string;
  effort?: string;
  schema?: Record<string, unknown>;
}): Promise<CliEnvelope> {
  const exe = resolveClaudeExe();
  const dir = await mkdtemp(path.join(tmpdir(), "thesis-forge-"));
  const systemFile = path.join(dir, "system.md");
  await writeFile(systemFile, input.system, "utf8");
  try {
    const args = [
      "-p",
      "--output-format", "json",
      "--model", input.model,
      "--system-prompt-file", systemFile,
      "--strict-mcp-config",
      "--allowedTools", "",
      "--max-turns", "4",
    ];
    if (input.effort) args.push("--effort", input.effort);
    if (input.schema) args.push("--json-schema", JSON.stringify(input.schema));
    const { stdout, stderr } = await run(exe, args, input.prompt, { env: cliEnv(), cwd: dir });
    let envelope: CliEnvelope;
    try {
      envelope = JSON.parse(stdout);
    } catch {
      throw new Error(`claude produced no JSON envelope: ${(stderr || stdout).slice(0, 400)}`);
    }
    if (envelope.is_error) throw new Error(`claude error: ${String(envelope.result).slice(0, 400)}`);
    return envelope;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export const claudeCliModel: ModelFn = async (req: ModelRequest) => {
  const model = process.env.THESIS_MODEL || DEFAULT_MODEL;
  const envelope = await runClaudeCli({
    system: req.system.map((b) => b.text).join("\n\n"),
    prompt: flatten(req.messages),
    model,
    effort: process.env.THESIS_EFFORT || DEFAULT_EFFORT,
    schema: cliSchema(),
  });
  if (envelope.structured_output === undefined) {
    throw new Error(`claude returned no structured_output: ${String(envelope.result).slice(0, 400)}`);
  }
  const parsed = TurnOutput.safeParse(envelope.structured_output);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`structured_output did not validate:\n${issues}`);
  }
  return { output: parsed.data, model: `cli:${model}`, usage: envelope.usage ?? null };
};
