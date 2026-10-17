/** Whether the deployment can serve, never what it is: five booleans for an
 *  uptime check. No probe spends a provider call. */
import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { mailConfigured } from "@/auth/delivery";
import journal from "../../drizzle/meta/_journal.json";

export interface Health {
  ok: boolean;
  db: boolean;
  migrations: boolean;
  embedder: boolean;
  mail: boolean;
}

/** The newest migration file's timestamp. The journal is imported, so it is
 *  in the bundle; the `.sql` files are not. */
export const LATEST_MIGRATION = Math.max(...journal.entries.map((e) => e.when));

/** drizzle records each applied migration's journal `when` in `created_at`. */
export async function health(db: Db, latest = LATEST_MIGRATION): Promise<Health> {
  let up = false;
  let current = false;
  try {
    const result = await db.execute(sql`select max(created_at)::text as applied from drizzle.__drizzle_migrations`);
    const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as { applied: string | null }[];
    up = true;
    current = Number(rows[0]?.applied ?? 0) >= latest;
  } catch {
    // An unreachable database, or one never migrated: both are false.
  }
  const embedder = Boolean(process.env.VOYAGE_API_KEY?.trim());
  const mail = mailConfigured();
  return { ok: up && current && embedder && mail, db: up, migrations: current, embedder, mail };
}
