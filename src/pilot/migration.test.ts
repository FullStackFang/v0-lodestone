import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";

type Rows<T> = { rows: T[] };

function migrationFolderThrough(lastIndex: number) {
  const source = path.join(process.cwd(), "drizzle");
  const destination = mkdtempSync(path.join(tmpdir(), "pilot-migration-"));
  mkdirSync(path.join(destination, "meta"));
  const journal = JSON.parse(readFileSync(path.join(source, "meta", "_journal.json"), "utf8")) as {
    entries: Array<{ idx: number; tag: string }>;
  };
  journal.entries = journal.entries.filter((entry) => entry.idx <= lastIndex);
  writeFileSync(path.join(destination, "meta", "_journal.json"), JSON.stringify(journal));
  for (const entry of journal.entries) {
    copyFileSync(path.join(source, `${entry.tag}.sql`), path.join(destination, `${entry.tag}.sql`));
  }
  return destination;
}

describe("pilot launch data migration", () => {
  it("withdraws broad cohort sharing without enrolling or deleting existing owners", async () => {
    const beforePilot = migrationFolderThrough(5);
    const allMigrations = path.join(process.cwd(), "drizzle");
    const client = await PGlite.create({ extensions: { vector } });
    const db = drizzle({ client, schema });
    try {
      await migrate(db, { migrationsFolder: beforePilot });
      await client.exec(`
        insert into person (id, name, email) values
          ('00000000-0000-4000-8000-000000000001', 'Owner One', 'one@example.test'),
          ('00000000-0000-4000-8000-000000000002', 'Owner Two', 'two@example.test');
        insert into session (id, person_id) values
          ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001');
        insert into thesis_card (id, session_id, slug, provenance) values
          ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000011', 'kept-idea', '{}');
        insert into card_revision (id, card_id, owner_id, version, fields, visibility) values
          ('00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000001', 1, '{}', 'unlisted'),
          ('00000000-0000-4000-8000-000000000032', '00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000001', 2, '{}', 'cohort');
        insert into founder_preferences (person_id, discoverable, availability, intent) values
          ('00000000-0000-4000-8000-000000000001', true, 'part_time', 'cofounder');
        insert into match_results (id, edge_type, query_subject_type, query_subject_id, candidate_subject_id, score, rank, components, assertion_set_hash) values
          ('00000000-0000-4000-8000-000000000041', 'cofounder', 'person', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 0.8, 1, '{}', 'one-two'),
          ('00000000-0000-4000-8000-000000000042', 'cofounder', 'person', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 0.8, 1, '{}', 'two-one');
        insert into founder_introductions (id, match_result_id, requester_id, recipient_id, status, responded_at) values
          ('00000000-0000-4000-8000-000000000051', '00000000-0000-4000-8000-000000000041', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'pending', null),
          ('00000000-0000-4000-8000-000000000052', '00000000-0000-4000-8000-000000000042', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'accepted', now());
      `);

      await migrate(db, { migrationsFolder: allMigrations });

      const owners = await db.execute(sql`select count(*)::int as count from person`) as Rows<{ count: number }>;
      const cards = await db.execute(sql`select count(*)::int as count from thesis_card`) as Rows<{ count: number }>;
      const revisions = await db.execute(sql`select visibility, revoked_at from card_revision order by version`) as Rows<{ visibility: string; revoked_at: Date | null }>;
      const preferences = await db.execute(sql`select discoverable, availability from founder_preferences`) as Rows<{ discoverable: boolean; availability: string }>;
      const introductions = await db.execute(sql`select status, cancellation_reason, cancelled_at from founder_introductions order by id`) as Rows<{ status: string; cancellation_reason: string | null; cancelled_at: Date | null }>;
      const memberships = await db.execute(sql`select count(*)::int as count from pilot_membership`) as Rows<{ count: number }>;

      expect(owners.rows[0].count).toBe(2);
      expect(cards.rows[0].count).toBe(1);
      expect(revisions.rows).toEqual([
        expect.objectContaining({ visibility: "unlisted", revoked_at: null }),
        expect.objectContaining({ visibility: "cohort", revoked_at: expect.anything() }),
      ]);
      expect(preferences.rows).toEqual([expect.objectContaining({ discoverable: false, availability: "part_time" })]);
      expect(introductions.rows).toEqual([
        expect.objectContaining({ status: "cancelled", cancellation_reason: "pilot_membership_migration", cancelled_at: expect.anything() }),
        expect.objectContaining({ status: "accepted", cancellation_reason: null, cancelled_at: null }),
      ]);
      expect(memberships.rows[0].count).toBe(0);
    } finally {
      await client.close();
      rmSync(beforePilot, { recursive: true, force: true });
    }
  });
});
