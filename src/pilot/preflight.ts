import path from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { productionConfig } from "./config.ts";

type Environment = Record<string, string | undefined>;
export type AppliedMigration = { hash: string; createdAt: number };
export type ReadinessDatabase = {
  connectivity(): Promise<boolean>;
  vectorInstalled(): Promise<boolean>;
  appliedMigrations(): Promise<AppliedMigration[]>;
  close(): Promise<void>;
};
export type ReadinessCheck = { id: "configuration" | "connection" | "pgvector" | "migrations"; ok: boolean; detail: string };
export type ReadinessResult = { ok: boolean; checks: ReadinessCheck[] };

async function connectPostgres(url: string): Promise<ReadinessDatabase> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { prepare: false, max: 1 });
  return {
    connectivity: async () => Boolean((await sql`select 1 as ready`)[0]?.ready),
    vectorInstalled: async () => Boolean((await sql`select exists(select 1 from pg_extension where extname = 'vector') as installed`)[0]?.installed),
    appliedMigrations: async () => (await sql`select hash, created_at from drizzle.__drizzle_migrations order by created_at`)
      .map((row) => ({ hash: String(row.hash), createdAt: Number(row.created_at) })),
    close: async () => { await sql.end(); },
  };
}

export async function checkPilotReadiness(options: {
  env?: Environment;
  connect?: (url: string) => Promise<ReadinessDatabase>;
  migrationsFolder?: string;
} = {}): Promise<ReadinessResult> {
  const checks: ReadinessCheck[] = [];
  let config;
  try {
    config = productionConfig(options.env ?? process.env);
    checks.push({ id: "configuration", ok: true, detail: "production requirements present" });
  } catch {
    checks.push({ id: "configuration", ok: false, detail: "production configuration invalid" });
    return { ok: false, checks };
  }

  let db: ReadinessDatabase;
  try {
    db = await (options.connect ?? connectPostgres)(config.databaseUrl);
    if (!await db.connectivity()) throw new Error("unavailable");
    checks.push({ id: "connection", ok: true, detail: "database reachable" });
  } catch {
    checks.push({ id: "connection", ok: false, detail: "database connection failed" });
    return { ok: false, checks };
  }

  try {
    try {
      const installed = await db.vectorInstalled();
      checks.push({ id: "pgvector", ok: installed, detail: installed ? "extension installed" : "extension missing" });
    } catch {
      checks.push({ id: "pgvector", ok: false, detail: "extension check failed" });
    }
    try {
      const expected = readMigrationFiles({ migrationsFolder: options.migrationsFolder ?? path.join(process.cwd(), "drizzle") })
        .map(({ hash, folderMillis }) => ({ hash, createdAt: folderMillis }));
      const applied = await db.appliedMigrations();
      const aligned = JSON.stringify(applied) === JSON.stringify(expected);
      checks.push({ id: "migrations", ok: aligned, detail: aligned ? "schema aligned" : "schema migration history differs" });
    } catch {
      checks.push({ id: "migrations", ok: false, detail: "schema alignment check failed" });
    }
  } finally {
    await db.close().catch(() => {});
  }
  return { ok: checks.every((check) => check.ok), checks };
}
