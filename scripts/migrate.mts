/** `npm run db:migrate` — apply `./drizzle` to `DATABASE_URL`.
 *
 * The production release step. `createPostgresDb` only migrates on connect
 * outside production, so a production database receives migrations here and
 * nowhere else. Idempotent: drizzle records applied migrations in
 * `__drizzle_migrations` and skips them on the next run. */
import "./harness/env.mts";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL is not set. Migrations apply to Postgres only; PGlite migrates itself on open.");
  process.exit(1);
}

const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("migrations applied");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
