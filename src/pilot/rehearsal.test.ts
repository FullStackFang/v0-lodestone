import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { databaseUrlFromPort, rehearsalEnvironment, requireLocalDocker } from "../../scripts/pilot/rehearsal.mts";

describe("isolated pilot release rehearsal", () => {
  it("prints help without requiring a running or local Docker engine", () => {
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/pilot/rehearse.mts", "--help"], {
      encoding: "utf8", windowsHide: true, timeout: 15_000,
      env: { ...process.env, DOCKER_HOST: "ssh://unavailable.example.test" },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("npm run pilot:rehearse");
    expect(result.stdout).not.toContain("RUN ");
  });

  it("rejects an accidentally supplied database URL without printing it or touching Docker", () => {
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/pilot/rehearse.mts", "postgres://accidental-secret@db.example.test/production"], {
      encoding: "utf8", windowsHide: true, timeout: 15_000,
    });
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("RUN ");
    expect(result.stdout + result.stderr).not.toContain("accidental-secret");
  });

  it("keeps Windows and Unix local Docker engines usable", () => {
    expect(requireLocalDocker("unix:///var/run/docker.sock\n")).toBe("unix:///var/run/docker.sock");
    expect(requireLocalDocker("npipe:////./pipe/dockerDesktopLinuxEngine")).toBe("npipe:////./pipe/dockerDesktopLinuxEngine");
  });

  it.each(["ssh://production", "tcp://db.example.test:2376", "npipe:////remote/pipe/docker_engine", ""])(
    "refuses to create a rehearsal container on a remote or absent engine: %s", (endpoint) => {
      expect(() => requireLocalDocker(endpoint)).toThrow("local Docker engine");
    },
  );

  it("uses Docker's assigned loopback port instead of a configured production database", () => {
    expect(databaseUrlFromPort("127.0.0.1:55432\n")).toBe("postgres://pilot:pilot-rehearsal-only@127.0.0.1:55432/pilot");
  });

  it.each(["0.0.0.0:55432", "db.example.test:5432", "127.0.0.1:0", "127.0.0.1:65536", "127.0.0.1:5432\n0.0.0.0:5432"])(
    "rejects an unexpected database binding: %s", (binding) => {
      expect(() => databaseUrlFromPort(binding)).toThrow("loopback port");
    },
  );

  it("replaces deployment configuration and strips inherited credentials and Node preloads", () => {
    const env = rehearsalEnvironment({
      Path: "C:\\node", SystemRoot: "C:\\Windows", HOME: "/home/runner",
      DATABASE_URL: "postgres://production-secret@db.example.test/production",
      PILOT_POSTGRES_URL: "postgres://production-secret@db.example.test/production",
      RESEND_API_KEY: "production-secret", ANTHROPIC_API_KEY: "production-secret",
      VOYAGE_API_KEY: "production-secret", GITHUB_TOKEN: "production-secret",
      NODE_OPTIONS: "--require unsafe-preload", NODE_ENV: "development",
    }, "postgres://pilot:pilot-rehearsal-only@127.0.0.1:55432/pilot");
    expect(env.Path).toBe("C:\\node");
    expect(env.SystemRoot).toBe("C:\\Windows");
    expect(env.HOME).toBe("/home/runner");
    expect(env.DATABASE_URL).toBe("postgres://pilot:pilot-rehearsal-only@127.0.0.1:55432/pilot");
    expect(env.PILOT_POSTGRES_URL).toBe(env.DATABASE_URL);
    expect(env.NODE_ENV).toBe("production");
    expect(env.ANTHROPIC_API_KEY).toBe("");
    expect(env.VOYAGE_API_KEY).toBe("");
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(JSON.stringify(env)).not.toContain("production-secret");
  });
});
