/** One database handle, two drivers.
 *
 * `DATABASE_URL` set → postgres-js against a real Postgres (Neon, Vercel
 * Postgres, Supabase — anything with pgvector). Unset → PGlite in-process,
 * on disk under `data/pglite` in dev and in memory under test. Both run the
 * same `drizzle/` migrations on first connect, so a fresh clone is one
 * `npm run dev` from working and the tests never need a service.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { productionConfig } from "@/pilot/config";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite-pgvector");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  // PGlite makes its own directory but not the parents.
  if (dataDir) await mkdir(path.dirname(dataDir), { recursive: true });
  const client = await PGlite.create({ dataDir, extensions: { vector } });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

export async function createPostgresDb(url: string, migrateOnConnect = process.env.NODE_ENV !== "production"): Promise<Db> {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const client = postgres(url, { prepare: false });
  const db = drizzle({ client, schema });
  if (migrateOnConnect) {
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  }
  return db;
}

let handle: Promise<Db> | undefined;

/** The app's database, created on first call. Survives Next's dev-mode
 *  module reloads via `globalThis`, otherwise every hot reload would open
 *  another PGlite on the same directory. */
export function getDb(): Promise<Db> {
  const g = globalThis as { __thesisForgeDb?: Promise<Db> };
  if (g.__thesisForgeDb) return g.__thesisForgeDb;
  if (!handle) {
    const url = process.env.NODE_ENV === "production"
      ? productionConfig().databaseUrl
      : process.env.DATABASE_URL;
    handle = url
      ? createPostgresDb(url)
      : createPgliteDb(process.env.VITEST ? undefined : path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.THESIS_DATA_DIR || "data/pglite"));
    // A failed connect must not be remembered, or one bad start poisons
    // every request after it.
    handle.catch(() => {
      handle = undefined;
      delete g.__thesisForgeDb;
    });
    g.__thesisForgeDb = handle;
  }
  return handle;
}

export { schema };
