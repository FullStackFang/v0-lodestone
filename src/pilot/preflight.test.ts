import { describe, expect, it } from "vitest";
import { readMigrationFiles } from "drizzle-orm/migrator";
import path from "node:path";
import { checkPilotReadiness, type ReadinessDatabase } from "./preflight";

const env = {
  DATABASE_URL: "postgres://runtime:super-secret@db.example.test/forge?sslmode=require",
  BETTER_AUTH_URL: "https://pilot.example.test",
  BETTER_AUTH_SECRET: "a-production-secret-with-at-least-32-characters",
  AUTH_EMAIL_FROM: "pilot@example.test",
  RESEND_API_KEY: "re_secret_value",
  PILOT_OPERATOR_EMAILS: "operator@example.test",
};
const migrations = readMigrationFiles({ migrationsFolder: path.join(process.cwd(), "drizzle") });

function database(overrides: Partial<ReadinessDatabase> = {}): ReadinessDatabase {
  return {
    connectivity: async () => true,
    vectorInstalled: async () => true,
    appliedMigrations: async () => migrations.map((migration) => ({ hash: migration.hash, createdAt: migration.folderMillis })),
    close: async () => {},
    ...overrides,
  };
}

describe("pilot readiness", () => {
  it("checks production policy even when NODE_ENV is unset", async () => {
    const result = await checkPilotReadiness({ env: { ...env, DATABASE_URL: "" }, connect: async () => database() });
    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({ id: "configuration", ok: false }));
  });

  it("detects missing pgvector and migration drift without mutating the database", async () => {
    let calls = 0;
    const db = database({
      vectorInstalled: async () => false,
      appliedMigrations: async () => { calls += 1; return migrations.slice(0, -1).map((m) => ({ hash: m.hash, createdAt: m.folderMillis })); },
    });
    const result = await checkPilotReadiness({ env, connect: async () => db });
    expect(result.ok).toBe(false);
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "pgvector", ok: false }),
      expect.objectContaining({ id: "migrations", ok: false }),
    ]));
    expect(calls).toBe(1);
  });

  it("redacts secret-bearing connection failures", async () => {
    const result = await checkPilotReadiness({
      env,
      connect: async () => { throw new Error(`could not connect to ${env.DATABASE_URL} using ${env.RESEND_API_KEY}`); },
    });
    const text = JSON.stringify(result);
    expect(result.ok).toBe(false);
    expect(text).toContain("connection");
    expect(text).not.toContain("super-secret");
    expect(text).not.toContain("re_secret_value");
  });
});
