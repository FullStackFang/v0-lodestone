import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const appDirectory = fileURLToPath(new URL("../../", import.meta.url));

export function requireLocalDocker(endpoint: string): string {
  const local = endpoint.trim();
  if (!local.startsWith("unix:///") && !local.startsWith("npipe:////./pipe/")) {
    throw new Error("Rehearsal requires a local Docker engine; remote contexts are refused.");
  }
  return local;
}

export function databaseUrlFromPort(binding: string): string {
  const match = /^127\.0\.0\.1:(\d+)$/.exec(binding.trim());
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535) {
    throw new Error("Docker did not provide a single loopback port.");
  }
  return `postgres://pilot:pilot-rehearsal-only@127.0.0.1:${match[1]}/pilot`;
}

export function rehearsalEnvironment(parent: NodeJS.ProcessEnv, databaseUrl: string): NodeJS.ProcessEnv {
  // Preserve OS/tool lookup only. Never forward a user's deployment credentials
  // or NODE_OPTIONS into the scripts and tests used by the rehearsal.
  const operatingSystem = new Set([
    "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP", "TMPDIR",
    "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "LANG", "LC_ALL", "CI",
  ]);
  return {
    ...Object.fromEntries(Object.entries(parent).filter(([key]) => operatingSystem.has(key.toUpperCase()))),
    DATABASE_URL: databaseUrl, PILOT_POSTGRES_URL: databaseUrl,
    NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
    BETTER_AUTH_URL: "https://pilot.invalid",
    BETTER_AUTH_SECRET: randomUUID(), AUTH_EMAIL_FROM: "pilot@pilot.invalid",
    RESEND_API_KEY: "re_rehearsal_invalid", PILOT_OPERATOR_EMAILS: "operator@pilot.invalid",
    RESOURCE_CURATOR_EMAILS: "", ANTHROPIC_API_KEY: "", VOYAGE_API_KEY: "",
    THESIS_ENGINE: "api", MATCHING_ENABLED: "", THESIS_DATA_DIR: "",
  };
}

export async function rehearsePilot(): Promise<void> {
  const name = `thesis-pilot-rehearsal-${randomUUID()}`;
  const abort = new AbortController();
  const interrupt = () => abort.abort();
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  let containerId: string | undefined;
  let endpoint: string;
  let stage = "Docker connection";

  async function command(file: string, args: string[], env = process.env, expectedExit = 0) {
    try {
      const result = await exec(file, args, {
        cwd: appDirectory, env, windowsHide: true, timeout: 180_000,
        maxBuffer: 4 * 1024 * 1024, signal: abort.signal,
      });
      assert.equal(expectedExit, 0, "Expected the controlled failure to fail");
      return result.stdout.trim();
    } catch (error) {
      const failure = error as { code?: number | string; stdout?: string };
      if (expectedExit !== 0 && failure.code === expectedExit) return failure.stdout?.trim() ?? "";
      // No command arguments, connection URLs, raw database errors or test
      // records escape into the rehearsal's operational output.
      throw new Error(`${stage} failed${typeof failure.code === "number" ? ` (exit ${failure.code})` : ""}.`);
    }
  }
  const docker = (...args: string[]) => command("docker", ["--host", endpoint, ...args]);
  const node = (args: string[], env: NodeJS.ProcessEnv, expectedExit = 0) => command(process.execPath, args, env, expectedExit);
  const begin = (label: string) => { stage = label; console.log(`RUN ${label}`); };

  try {
    const configuredHost = process.env.DOCKER_CONTEXT ? undefined : process.env.DOCKER_HOST;
    endpoint = requireLocalDocker(configuredHost ?? await command("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"]));
    await docker("info", "--format", "{{.ServerVersion}}");
    begin("Create isolated PostgreSQL 16/pgvector");
    console.log(`Container: ${name}`);
    containerId = await docker("create", "--name", name, "--label", "thesis-forge.pilot-rehearsal=true",
      "--publish", "127.0.0.1::5432", "--env", "POSTGRES_DB=pilot", "--env", "POSTGRES_USER=pilot",
      "--env", "POSTGRES_PASSWORD=pilot-rehearsal-only",
      "--health-cmd", "pg_isready -h 127.0.0.1 -U pilot -d pilot",
      "--health-interval", "1s", "--health-timeout", "3s", "--health-retries", "60",
      "pgvector/pgvector:pg16");
    await docker("start", containerId);
    let healthy = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      healthy = await docker("inspect", "--format", "{{.State.Health.Status}}", containerId) === "healthy";
      if (healthy) break;
      await setTimeout(1000, undefined, { signal: abort.signal });
    }
    assert.ok(healthy, "Postgres did not become healthy within 60 checks");
    const url = databaseUrlFromPort(await docker("port", containerId, "5432/tcp"));
    const env = rehearsalEnvironment(process.env, url);
    const typed = ["--experimental-strip-types"];
    const tsx = ["--import", "tsx"];

    begin("Release migrations and production preflight");
    await node([...typed, "scripts/migrate.mts"], env);
    const aligned = await node([...typed, "scripts/pilot/check.mts"], env);
    assert.ok(aligned.includes("PASS migrations"), "Expected aligned release schema");
    begin("Fail-closed preflight with missing configuration");
    const missing = await node([...typed, "scripts/pilot/check.mts"], { ...env, DATABASE_URL: "" }, 1);
    assert.ok(missing.includes("FAIL configuration"), "Expected a configuration failure");

    begin("Real Postgres membership, revocation and worker concurrency");
    await node(["node_modules/vitest/vitest.mjs", "run", "src/pilot/postgres.integration.test.ts"], { ...env, NODE_ENV: "test" });

    // The concurrency fixture uses the latest slot. Use an earlier occurrence
    // for the CLI check so both checks must execute real work, then replay it.
    // Production schedulers must supply their own occurrence, as documented.
    const occurrence = new Date();
    occurrence.setUTCHours(2, 0, 0, 0);
    occurrence.setUTCDate(occurrence.getUTCDate() - 2);
    const slot = occurrence.toISOString();
    begin("Scheduled refresh and successful-slot replay");
    const first = JSON.parse(await node([...tsx, "scripts/resources/refresh.mts", "--slot", slot], env));
    const replay = JSON.parse(await node([...tsx, "scripts/resources/refresh.mts", "--slot", slot], env));
    assert.equal(first.status, "succeeded");
    assert.equal(replay.status, "replayed");
    assert.equal(replay.runId, first.runId);
    begin("Daily retention cleanup");
    const cleanup = JSON.parse(await node([...tsx, "scripts/pilot/cleanup.mts"], env));
    assert.equal(typeof cleanup.removedRuns, "number");
    assert.equal(typeof cleanup.removedActivity, "number");

    const snapshotSql = `SELECT md5(jsonb_build_object(
      'people', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM person t),
      'ideas', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM thesis_card t),
      'memberships', (SELECT jsonb_agg(to_jsonb(t) ORDER BY person_id) FROM pilot_membership t),
      'publications', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM card_revision t),
      'needs', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM idea_needs t),
      'runs', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM refresh_run t)
    )::text);`;
    const snapshot = (database: string) => docker("exec", containerId!, "psql", "-X", "-U", "pilot", "-d", database, "-At", "-v", "ON_ERROR_STOP=1", "-c", snapshotSql);
    begin("Capture owner-history fingerprint");
    const before = await snapshot("pilot");
    begin("Create database backup");
    await docker("exec", containerId, "pg_dump", "-U", "pilot", "-d", "pilot", "--format=custom", "--file=/tmp/pilot.dump");
    begin("Restore backup into a separate database");
    await docker("exec", containerId, "createdb", "-U", "pilot", "pilot_restore");
    await docker("exec", containerId, "pg_restore", "-U", "pilot", "--dbname=pilot_restore", "--exit-on-error", "/tmp/pilot.dump");
    begin("Compare restored owner history and rerun preflight");
    assert.equal(await snapshot("pilot_restore"), before, "Restored history differs from the backup source");
    const restoredUrl = new URL(url);
    restoredUrl.pathname = "/pilot_restore";
    await node([...typed, "scripts/pilot/check.mts"], rehearsalEnvironment(process.env, restoredUrl.toString()));
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    if (containerId) {
      // Cleanup is deliberately outside the aborted command signal. The exact
      // ID came from our create call; no existing container or host path is used.
      try {
        await exec("docker", ["--host", endpoint!, "rm", "--force", "--volumes", containerId], { windowsHide: true, timeout: 30_000 });
        console.log("PASS temporary container and database volumes removed");
      } catch {
        throw new Error(`Cleanup failed. Remove only rehearsal container ${name} and its anonymous volumes.`);
      }
    }
  }
  console.log("PASS pilot release rehearsal (synthetic data; no deployment or email)");
}
