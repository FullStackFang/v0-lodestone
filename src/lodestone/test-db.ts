/** An in-memory database that records every statement it runs, for tests
 *  that count queries. Its own instance: the shared test handle `getDb`
 *  returns is a `globalThis` singleton built without a logger. */
import { createPgliteDb, type Db } from "@/db/client";

export interface CountingDb {
  db: Db;
  /** Every statement since the handle opened, migrations included; take a
   *  length before the work and slice after it. */
  statements: string[];
}

export async function countingDb(): Promise<CountingDb> {
  const statements: string[] = [];
  const db = await createPgliteDb(undefined, { logger: { logQuery: (query) => statements.push(query) } });
  return { db, statements };
}
