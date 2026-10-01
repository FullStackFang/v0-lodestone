import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { artifactTexts } from "@/db/schema";
import { getCanonicalText, hashText, normalize, putArtifactText } from "./canonical";

const fixture = JSON.parse(
  readFileSync(path.join(process.cwd(), "evals", "harness", "canonical", "fixture.json"), "utf8"),
) as {
  raw: string;
  canonical: string;
  text_hash: string;
  span: { start: number; end: number; quote: string };
};

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let db: Db;
beforeAll(async () => {
  db = await createPgliteDb();
});

describe("normalize", () => {
  it("reproduces the fixture's canonical text and hash, byte for byte", () => {
    expect(normalize(fixture.raw)).toBe(fixture.canonical);
    expect(hashText(fixture.raw)).toBe(fixture.text_hash);
  });

  it("is idempotent", () => {
    const once = normalize(fixture.raw);
    expect(normalize(once)).toBe(once);
    expect(hashText(once)).toBe(fixture.text_hash);
  });

  it("removes a soft hyphen from inside a word, and the hash notices", () => {
    const withSoft = "a diag­nosis";
    expect(normalize(withSoft)).toBe("a diagnosis");
    expect(hashText(withSoft)).toBe(hashText("a diagnosis"));
    expect(hashText(withSoft)).not.toBe(hashText("a diag-nosis"));
  });

  it("removes the zero-width space and the byte-order mark", () => {
    expect(normalize("trial​ ran﻿")).toBe("trial ran");
  });

  it("composes to NFC and collapses every run of whitespace", () => {
    expect(normalize("café")).toBe("café");
    expect(normalize("  a\r\n\r\n b\t\tc  ")).toBe("a b c");
  });

  it("leaves case, curly quotes and hard hyphens alone", () => {
    expect(normalize("A Rapid’s well-known Case")).toBe("A Rapid’s well-known Case");
  });
});

describe("offsets are UTF-16 code units", () => {
  it("a TypeScript slice returns the recorded quote", () => {
    expect(fixture.canonical.slice(fixture.span.start, fixture.span.end)).toBe(fixture.span.quote);
  });

  it("Postgres substr over the same row does not, because an emoji precedes the span", async () => {
    const { textHash } = await putArtifactText(db, {
      artifactId: uuid(1),
      sourceFormat: "abstract",
      parser: "fixture-v1",
      text: fixture.raw,
    });
    const { start, end } = fixture.span;
    const rows = (await db.execute(
      sql`select substr(canonical_text, ${start + 1}, ${end - start}) as slice from artifact_texts where text_hash = ${textHash}`,
    )) as { rows: { slice: string }[] };
    expect(rows.rows[0].slice).not.toBe(fixture.span.quote);
    // One astral character before the span: Postgres counts it as one code
    // point where JavaScript counts two code units, so a JS offset handed to
    // `substr` lands one character late.
    expect(rows.rows[0].slice).toBe(fixture.canonical.slice(start + 1, end + 1));
  });

  it("no SQL in the harness or the app slices a canonical text", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(p)) {
          const src = readFileSync(p, "utf8");
          // This test's own demonstration is the exception it exists to make.
          if (p.endsWith("canonical.test.ts")) continue;
          for (const fn of ["substr(", "left(", "right(", "char_length("]) {
            const at = src.indexOf(fn);
            if (at >= 0 && /canonical_text/.test(src.slice(Math.max(0, at - 200), at + 200))) {
              offenders.push(`${p}: ${fn}`);
            }
          }
        }
      }
    };
    walk(path.join(process.cwd(), "src", "harness"));
    walk(path.join(process.cwd(), "src", "app"));
    expect(offenders).toEqual([]);
  });
});

describe("putArtifactText", () => {
  it("writes once for the same input twice", async () => {
    const input = {
      artifactId: uuid(2),
      sourceFormat: "abstract" as const,
      parser: "fixture-v1",
      text: "  A stable  abstract.\r\n",
    };
    const first = await putArtifactText(db, input);
    const second = await putArtifactText(db, input);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.textHash).toBe(first.textHash);
    expect(second.id).toBe(first.id);
    const rows = await db
      .select()
      .from(artifactTexts)
      .where(sql`${artifactTexts.textHash} = ${first.textHash}`);
    expect(rows).toHaveLength(1);
    expect(rows[0].version).toBe(1);
  });

  it("makes a re-parse version 2 and leaves version 1 alone", async () => {
    const artifactId = uuid(3);
    const first = await putArtifactText(db, {
      artifactId,
      sourceFormat: "deck",
      parser: "pdf-v1",
      text: "The first reading.",
    });
    const second = await putArtifactText(db, {
      artifactId,
      sourceFormat: "deck",
      parser: "pdf-v2",
      text: "The second reading, with a fixed ligature.",
    });
    expect(second.version).toBe(2);
    expect(second.textHash).not.toBe(first.textHash);
    expect(await getCanonicalText(db, first.textHash)).toBe("The first reading.");
  });

  it("names the first artifact when a second resolves to the same text", async () => {
    const text = "Two DOIs, one abstract.";
    const first = await putArtifactText(db, {
      artifactId: uuid(4),
      sourceFormat: "abstract",
      parser: "openalex-v1",
      text,
    });
    const second = await putArtifactText(db, {
      artifactId: uuid(5),
      sourceFormat: "abstract",
      parser: "openalex-v1",
      text,
    });
    expect(second.created).toBe(false);
    expect(second.sharedWith).toBe(uuid(4));
    expect(second.id).toBe(first.id);
  });

  it("lets a stage event own a text, with no document row", async () => {
    const result = await putArtifactText(db, {
      artifactId: uuid(6),
      sourceFormat: "stage_event",
      parser: "window-v1",
      text: "I talked to eleven dentists. ¶ Which ones said yes?",
      provenance: { stage_event_id: uuid(6) },
    });
    expect(result.created).toBe(true);
    // The separator survives normalization — segment boundaries have to.
    expect(await getCanonicalText(db, result.textHash)).toContain("¶");
  });
});
