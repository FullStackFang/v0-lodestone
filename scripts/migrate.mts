/** `npm run db:migrate` — apply `./drizzle` to `DATABASE_URL_UNPOOLED`, else
 *  `DATABASE_URL`.
 *
 * The production release step. `createPostgresDb` only migrates on connect
 * outside production, so a production database receives migrations here and
 * nowhere else. The direct URL is preferred because the migrator holds an
 * advisory lock that a pooler can drop. It prints the host it used, so a run
 * against the wrong database is visible. Idempotent: drizzle records applied
 * migrations in `__drizzle_migrations` and skips them on the next run. */
import "./harness/env.mts";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const unpooled = process.env.DATABASE_URL_UNPOOLED?.trim();
const url = unpooled || process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("Neither DATABASE_URL_UNPOOLED nor DATABASE_URL is set. Migrations apply to Postgres only; PGlite migrates itself on open.");
  process.exit(1);
}
console.log(`migrating ${new URL(url).host} (${unpooled ? "DATABASE_URL_UNPOOLED" : "DATABASE_URL"})`);

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
