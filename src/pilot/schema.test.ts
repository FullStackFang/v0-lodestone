import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createPgliteDb } from "@/db/client";

type Rows<T> = { rows: T[] };

describe("pilot persistence", () => {
  it("creates invitation and membership tables plus cancellable introduction history", async () => {
    const db = await createPgliteDb();
    const tables = await db.execute(sql`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
      order by table_name
    `) as Rows<{ table_name: string }>;
    expect(tables.rows.map((row) => row.table_name)).toEqual(expect.arrayContaining([
      "pilot_invitation",
      "pilot_membership",
    ]));

    const columns = await db.execute(sql`
      select column_name
      from information_schema.columns
      where table_schema = 'public' and table_name = 'founder_introductions'
      order by column_name
    `) as Rows<{ column_name: string }>;
    expect(columns.rows.map((row) => row.column_name)).toEqual(expect.arrayContaining([
      "cancelled_at",
      "cancellation_reason",
    ]));

    const indexes = await db.execute(sql`
      select indexdef
      from pg_indexes
      where schemaname = 'public' and tablename = 'founder_introductions'
    `) as Rows<{ indexdef: string }>;
    expect(indexes.rows.some((row) =>
      /unique/i.test(row.indexdef) &&
      /least\(requester_id, recipient_id\)/i.test(row.indexdef) &&
      /greatest\(requester_id, recipient_id\)/i.test(row.indexdef) &&
      /where.*status = 'pending'/i.test(row.indexdef),
    )).toBe(true);
  });
});

