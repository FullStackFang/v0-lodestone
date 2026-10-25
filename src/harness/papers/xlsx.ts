/** The NeurIPS corpus spreadsheet as a paper source.
 *
 * Each row of the `Corpus` sheet is one paper: its abstract (or, for a row
 * with none, its TLDR) is the canonical text, and every other column rides in
 * provenance. Rows are keyed on the sheet's `id` column as `neurips_id` — a
 * third of them have no OpenReview id, and none is matched to OpenAlex.
 *
 * A metric the sheet does not have is left out of provenance, never written
 * as 0: unknown is not zero. The sheet marks a missing citation count `-1`
 * with a percentile of `0`; both are read as absent.
 *
 * Written the way `ingestWork` writes a work — checked by id first, then by
 * text hash, then `document` and `artifact_texts` in one transaction — but
 * without the word floor: these are accepted papers, not search noise, and a
 * TLDR is short by nature. */
import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { artifactTexts, document } from "@/db/schema";
import { hashText, normalize, putArtifactText } from "../canonical";
import { storedBySourceId, type IngestResult, type IngestStatus } from "./ingest";

export const PARSER = "neurips-xlsx-v1";
export const SHEET = "Corpus";

export type Cells = Record<string, unknown>;

export interface NeuripsRow {
  neuripsId: string;
  title: string | null;
  text: string;
  sourceFormat: "abstract" | "tldr";
  provenance: Record<string, unknown>;
}

export interface NeuripsIngestResult extends Omit<IngestResult, "status"> {
  status: IngestStatus | "no_text";
}

/** Columns read as numbers; a metric that is negative is the sheet's "no data". */
const NUMERIC = ["year", "citations", "citations_per_year", "citation_percentile_in_year", "rating_avg", "bend_relevance"];
const CITATION_METRICS = ["citations", "citations_per_year", "citation_percentile_in_year"];

/** A cell as text: exceljs hands back rich text, hyperlinks and formulas as objects. */
function cellText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    const v = value as { text?: unknown; result?: unknown; richText?: { text: string }[] };
    if (v.richText) return cellText(v.richText.map((r) => r.text).join(""));
    if (v.text !== undefined) return cellText(v.text);
    if (v.result !== undefined) return cellText(v.result);
    if (value instanceof Date) return value.toISOString();
    return null;
  }
  const text = normalize(String(value));
  return text.length > 0 ? text : null;
}

function cellNumber(value: unknown): number | null {
  const text = cellText(value);
  if (text === null) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** `https://openreview.net/forum?id=X` → `X`. */
function openreviewIdOf(link: string): string | null {
  try {
    return new URL(link).searchParams.get("id");
  } catch {
    return null;
  }
}

/** A header-keyed row as a paper, or null when it has no `id`. */
export function rowOf(cells: Cells): NeuripsRow | null {
  const neuripsId = cellText(cells.id);
  if (!neuripsId) return null;
  const abstract = cellText(cells.abstract);
  const tldr = cellText(cells.tldr);

  const provenance: Record<string, unknown> = { neurips_id: neuripsId };
  for (const [key, value] of Object.entries(cells)) {
    if (key === "id" || key === "abstract") continue;
    if (NUMERIC.includes(key)) {
      const n = cellNumber(value);
      if (n !== null) provenance[key] = n;
    } else {
      const text = cellText(value);
      if (text !== null) provenance[key] = text;
    }
  }
  // A citation count of -1 is the sheet's "no citation data"; the percentile
  // it carries beside it (0) says nothing either.
  if (!(typeof provenance.citations === "number" && provenance.citations >= 0)) {
    for (const key of CITATION_METRICS) delete provenance[key];
  }
  for (const key of ["citations_per_year", "rating_avg"]) {
    if (typeof provenance[key] === "number" && (provenance[key] as number) < 0) delete provenance[key];
  }
  if (typeof provenance.authors === "string") {
    provenance.authors = provenance.authors.split(";").map((a) => a.trim()).filter((a) => a.length > 0);
  }
  if (typeof provenance.openreview === "string") {
    const id = openreviewIdOf(provenance.openreview);
    if (id) provenance.openreview_id = id;
  }

  return {
    neuripsId,
    title: cellText(cells.title),
    text: abstract ?? tldr ?? "",
    sourceFormat: abstract ? "abstract" : "tldr",
    provenance,
  };
}

/** Write one row. A row already held by its `neurips_id` — including a
 *  second row under the same id in one file — writes nothing; a row whose
 *  text is already stored under another document answers that document. */
export async function ingestNeuripsRow(db: Db, row: NeuripsRow, opts: { set: string }): Promise<NeuripsIngestResult> {
  const identifier = row.neuripsId;
  const provenance = { ...row.provenance, query_set: opts.set };
  const held = await storedBySourceId(db, { neurips_id: row.neuripsId });
  if (held) return { identifier, status: "ok", artifactId: held.artifactId, textHash: held.textHash, created: false, title: row.title, thin: held.thin };
  if (!row.text) return { identifier, status: "no_text", title: row.title };

  const textHash = hashText(row.text);
  const [existing] = await db
    .select({ artifactId: artifactTexts.artifactId })
    .from(artifactTexts)
    .where(eq(artifactTexts.textHash, textHash))
    .limit(1);
  if (existing) {
    return { identifier, status: "ok", artifactId: existing.artifactId, textHash, created: false, sharedWith: existing.artifactId, title: row.title };
  }

  const { id, put } = await db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(document)
      .values({ sessionId: null, source: "paper", title: row.title, text: null })
      .returning({ id: document.id });
    const put = await putArtifactText(tx, {
      artifactId: doc.id,
      sourceFormat: row.sourceFormat,
      parser: PARSER,
      text: row.text,
      provenance: row.sourceFormat === "tldr" ? { ...provenance, thin: true } : provenance,
    });
    return { id: doc.id, put };
  });
  return { identifier, status: "ok", artifactId: id, textHash: put.textHash, created: put.created, title: row.title, thin: row.sourceFormat === "tldr" };
}

/** The `Corpus` sheet a row at a time, keyed by its header row. Streams, so
 *  the 22 MB workbook is never held whole. */
export async function* readCorpusSheet(file: string): AsyncGenerator<Cells> {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(file, {
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "ignore",
    worksheets: "emit",
  });
  for await (const sheet of reader) {
    if ((sheet as unknown as { name: string }).name !== SHEET) continue;
    let header: string[] | null = null;
    for await (const row of sheet) {
      const values = (row.values as unknown[]).slice(1);
      if (!header) {
        header = values.map((v) => cellText(v) ?? "");
        continue;
      }
      const cells: Cells = {};
      header.forEach((name, at) => {
        const value = values[at];
        if (name && value !== null && value !== undefined) cells[name] = value;
      });
      if (Object.keys(cells).length > 0) yield cells;
    }
    return;
  }
  throw new Error(`no sheet named ${SHEET} in ${file}`);
}
