import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import drizzleConfig from "../../drizzle.config";
import { createPgliteDb } from "./client";

type Rows<T> = { rows: T[] };

describe("migrations", () => {
  it("apply to a fresh PGlite with the vector extension", async () => {
    const db = await createPgliteDb();
    const tables = (await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    )) as Rows<{ table_name: string }>;
    const names = tables.rows.map((r) => r.table_name);
    expect(names).toEqual(
      expect.arrayContaining(["session", "thesis_card", "stage_event", "document", "document_chunk"]),
    );
    // Every harness table, from the one contract migration.
    expect(names).toEqual(
      expect.arrayContaining([
        "person",
        "artifact_texts",
        "assertions",
        "extraction_runs",
        "judgments",
        "match_results",
        "match_params",
        "tag_facet_map",
        "reading_sessions",
        "annotations",
        "reconciliations",
      ]),
    );
    const ext = (await db.execute(sql`select extname from pg_extension where extname = 'vector'`)) as Rows<unknown>;
    expect(ext.rows).toHaveLength(1);
  });

  it("build the four partial HNSW indexes under PGlite", async () => {
    const db = await createPgliteDb();
    const idx = (await db.execute(
      sql`select indexname, indexdef from pg_indexes where tablename = 'assertions' and indexdef like '%hnsw%' order by indexname`,
    )) as Rows<{ indexname: string; indexdef: string }>;
    expect(idx.rows.map((r) => r.indexname)).toEqual([
      "assertions_context_hnsw",
      "assertions_evidence_hnsw",
      "assertions_mechanism_hnsw",
      "assertions_purpose_hnsw",
    ]);
    // Every one partial, and every one on the cosine operator class.
    for (const row of idx.rows) {
      expect(row.indexdef).toMatch(/vector_cosine_ops/);
      expect(row.indexdef).toMatch(/WHERE .*status = 'active'/);
      expect(row.indexdef).toMatch(/embedding IS NOT NULL/);
    }
  });

  it("seed the band-pass parameters and the tag map", async () => {
    const db = await createPgliteDb();
    const params = (await db.execute(
      sql`select edge_type, lambda, mu from match_params order by edge_type`,
    )) as Rows<{ edge_type: string; lambda: number; mu: number }>;
    expect(params.rows).toHaveLength(6);
    expect(params.rows.every((r) => Number(r.lambda) === 0.3 && Number(r.mu) === 0.3)).toBe(true);

    const tags = (await db.execute(
      sql`select tag, subtype, facet, writes_assertion from tag_facet_map order by tag, subtype nulls first`,
    )) as Rows<{ tag: string; subtype: string | null; facet: string | null; writes_assertion: boolean }>;
    expect(tags.rows).toHaveLength(10);
    const note = tags.rows.find((r) => r.tag === "note")!;
    const insight = tags.rows.find((r) => r.tag === "insight")!;
    expect(note.writes_assertion).toBe(false);
    expect(insight.writes_assertion).toBe(true);
    expect(insight.facet).toBeNull();
  });

  it("carry the production REVOKE statement in the migration", () => {
    const text = readFileSync(path.join(process.cwd(), "drizzle", "0001_harness.sql"), "utf8");
    expect(text).toMatch(/REVOKE DELETE ON assertions FROM/);
  });

  it("match the schema — drizzle-kit reports nothing to generate", () => {
    // `generate` writes its migration *before* anything can assert on its
    // output, so it is pointed at a throwaway directory. Seeded with a copy
    // of `drizzle/meta/`, because the comparison is against the snapshot in
    // the out-directory and an empty one reports the whole schema as new.
    const drizzleDir = path.join(process.cwd(), "drizzle");
    const migrationContents = () => readdirSync(drizzleDir, { recursive: true })
      .map(String).sort().filter((name) => statSync(path.join(drizzleDir, name)).isFile())
      .map((name) => [name, readFileSync(path.join(drizzleDir, name), "utf8")]);
    const before = migrationContents();
    const out = mkdtempSync(path.join(tmpdir(), "forge-drift-"));
    try {
      cpSync(path.join(drizzleDir, "meta"), path.join(out, "meta"), { recursive: true });
      const preload = path.join(out, "node-preload.cjs");
      writeFileSync(preload, "if (!process.geteuid) process.geteuid = () => 1000;\n");
      // `--out` puts drizzle-kit on the CLI-params path, which refuses
      // `--config` alongside it, so dialect and schema are read off the
      // config rather than restated — a second copy of them here is one
      // more thing that can drift. The out path is relative because
      // drizzle-kit joins it onto the cwd.
      const stdout = execFileSync(
        process.platform === "win32" ? "npx.cmd" : "npx",
        [
          "drizzle-kit",
          "generate",
          "--dialect",
          drizzleConfig.dialect,
          "--schema",
          ...[drizzleConfig.schema ?? []].flat(),
          "--out",
          path.relative(process.cwd(), out),
          "--name",
          "drift_check",
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          shell: process.platform === "win32",
          env: {
            ...process.env,
            NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require=${preload}`].filter(Boolean).join(" "),
          },
        },
      );
      expect(stdout).toMatch(/No schema changes/i);

      // The belt to that brace: a future refactor that drops `--out` is
      // caught here rather than by a migration nobody wrote reaching prod.
      expect(migrationContents()).toEqual(before);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 60_000);
});
