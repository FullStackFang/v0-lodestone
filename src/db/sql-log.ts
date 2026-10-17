/** `LODESTONE_SQL_LOG=1`: one line per statement, with the route that issued
 *  it, so a request's query count comes from the server and not from a test.
 *  Printed to the console and appended to `data/sql.log`, which
 *  `scripts/lodestone/measure.mts` reads between requests. Loaded by
 *  `getDb` only when the flag is set. */
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { Logger } from "drizzle-orm/logger";

export const SQL_LOG_FILE = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "sql.log");

/** The route being rendered, from Next's own request store. Internal API,
 *  read best-effort: a script or a test has no store and logs "-". */
async function routeReader(): Promise<() => string> {
  try {
    const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external");
    return () => workAsyncStorage.getStore()?.route ?? "-";
  } catch {
    return () => "-";
  }
}

export async function sqlLogger(): Promise<Logger> {
  const route = await routeReader();
  mkdirSync(path.dirname(SQL_LOG_FILE), { recursive: true });
  return {
    logQuery(query) {
      const line = `${route()}\t${query.replace(/\s+/g, " ").trim()}`;
      console.log(`[sql] ${line.slice(0, 160)}`);
      appendFileSync(SQL_LOG_FILE, `${line}\n`);
    },
  };
}
