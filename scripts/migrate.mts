/** `npm run db:migrate` — apply `drizzle/` to DATABASE_URL and exit.
 *  Connecting migrates (see db/client.ts), so this is just a connect. */
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set; PGlite migrates itself on first connect.");
  process.exit(1);
}

const client = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const db = drizzle(client);
await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
await client.end();
console.log("migrated");
process.exit(0);
