/** The vocabulary exists in three places — the Zod enums, the Drizzle
 *  tables, and the migration SQL a deployed database actually ran. Drizzle
 *  derives its enums from the Zod tuples, so the pairing that can drift is
 *  Zod against the SQL: a value added to a tuple without a migration is a
 *  column that rejects it at runtime. This test is that gate. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EvidenceType } from "@/schema/card";
import {
  ABSTRACTION_LEVELS,
  ASSERTION_STATUSES,
  CONFIDENCES,
  EDGE_TYPES,
  EVIDENCE_TYPES,
  FACETS,
  NOTE_KINDS,
  READING_MODES,
  RELATIONS,
  RUN_STATUSES,
  SOURCE_FORMATS,
  SOURCE_TYPES,
  SUBJECT_TYPES,
  VERDICTS,
} from "./schema";

const migrations = ["0000_init.sql", "0001_harness.sql"]
  .map((f) => readFileSync(path.join(process.cwd(), "drizzle", f), "utf8"))
  .join("\n");

/** The values of `CREATE TYPE "public"."<name>" AS ENUM(...)`. */
function sqlEnum(name: string): string[] {
  const re = new RegExp(`CREATE TYPE "public"\\."${name}" AS ENUM\\(([^)]*)\\)`);
  const m = migrations.match(re);
  if (!m) throw new Error(`no CREATE TYPE for ${name} in the migrations`);
  return m[1].split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
}

const pairs: [string, readonly string[]][] = [
  ["subject_type", SUBJECT_TYPES],
  ["facet", FACETS],
  ["abstraction_level", ABSTRACTION_LEVELS],
  ["source_type", SOURCE_TYPES],
  ["source_format", SOURCE_FORMATS],
  ["confidence", CONFIDENCES],
  ["evidence_type", EVIDENCE_TYPES],
  ["assertion_status", ASSERTION_STATUSES],
  ["run_status", RUN_STATUSES],
  ["edge_type", EDGE_TYPES],
  ["verdict", VERDICTS],
  ["reading_mode", READING_MODES],
  ["note_kind", NOTE_KINDS],
  ["relation", RELATIONS],
];

describe("enum parity", () => {
  it.each(pairs)("%s matches the migration", (name, values) => {
    expect(sqlEnum(name)).toEqual([...values]);
  });

  it("EvidenceType is the card's own ladder, not a copy", () => {
    expect(EvidenceType.options).toEqual([...EVIDENCE_TYPES]);
  });
});
