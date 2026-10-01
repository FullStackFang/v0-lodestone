/** What the three reading views ask the database.
 *
 * Kept out of the pages so the queries are testable and so nothing in a
 * route file has to know the shape of a join. The reader is always the
 * contract's `readerPerson()` — no module in this track reads
 * `HARNESS_READER_EMAIL`, and a grep test says so. */
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  annotations,
  artifactTexts,
  document,
  readingSessions,
  type AnnotationRow,
} from "@/db/schema";
import { readerPerson } from "../ledger";
import type { ReadingMode } from "../schema";

/** The list's preview window, in code units, sliced in TypeScript. */
const PREVIEW = 200;

/** The golden set is fifty complete readings. A denominator that moves is
 *  not a target. */
export const GOLDEN_SET_TARGET = 50;

export interface ArtifactListing {
  artifactId: string;
  textHash: string;
  version: number;
  title: string;
  sourceFormat: string;
  preview: string;
  annotationCount: number;
  /** At least one exhaustive session that ended. */
  complete: boolean;
}

/** Every `artifact_texts` row — papers and person documents alike. */
export async function listArtifacts(db: Db): Promise<ArtifactListing[]> {
  const texts = await db
    .select({
      artifactId: artifactTexts.artifactId,
      textHash: artifactTexts.textHash,
      version: artifactTexts.version,
      canonicalText: artifactTexts.canonicalText,
      sourceFormat: artifactTexts.sourceFormat,
      title: document.title,
      createdAt: artifactTexts.createdAt,
    })
    .from(artifactTexts)
    .leftJoin(document, eq(document.id, artifactTexts.artifactId))
    .orderBy(desc(artifactTexts.createdAt));

  const counts = await db
    .select({ textHash: annotations.textHash, n: sql<number>`count(*)::int` })
    .from(annotations)
    .groupBy(annotations.textHash);
  const countOf = new Map(counts.map((c) => [c.textHash, Number(c.n)]));

  const complete = await completeArtifacts(db);

  return texts.map((row) => ({
    artifactId: row.artifactId,
    textHash: row.textHash,
    version: row.version,
    title: row.title ?? "Untitled",
    sourceFormat: row.sourceFormat,
    preview: row.canonicalText.slice(0, PREVIEW),
    annotationCount: countOf.get(row.textHash) ?? 0,
    complete: complete.has(row.artifactId),
  }));
}

/** Artifacts with at least one *complete* session — exhaustive and ended.
 *  The one definition; the bench, the tracker and reconciliation all read
 *  it rather than each testing two columns. */
export async function completeArtifacts(db: Db): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ artifactId: readingSessions.artifactId })
    .from(readingSessions)
    .where(and(eq(readingSessions.mode, "exhaustive"), isNotNull(readingSessions.endedAt)));
  return new Set(rows.map((r) => r.artifactId));
}

export interface GoldenSet {
  n: number;
  target: number;
  /** Artifacts with no complete session yet. */
  missing: { artifactId: string; title: string }[];
}

export async function goldenSet(db: Db): Promise<GoldenSet> {
  const listing = await listArtifacts(db);
  const byArtifact = new Map(listing.map((row) => [row.artifactId, row]));
  const complete = await completeArtifacts(db);
  return {
    n: [...byArtifact.keys()].filter((id) => complete.has(id)).length,
    target: GOLDEN_SET_TARGET,
    missing: [...byArtifact.values()]
      .filter((row) => !complete.has(row.artifactId))
      .map((row) => ({ artifactId: row.artifactId, title: row.title })),
  };
}

/**
 * Open a reading session.
 *
 * One per open of the page, never reopened: exhaustive mode needs each
 * complete pass to be its own observation. `mode` is written here and
 * nowhere else — it is a promise made at the start, not a fact inferred at
 * the end.
 */
export async function openReading(db: Db, artifactId: string, mode: ReadingMode): Promise<string> {
  const text = await latestText(db, artifactId);
  if (!text) throw new Error(`no artifact_texts row for ${artifactId}`);
  const readerId = await readerPerson(db);
  const [row] = await db
    .insert(readingSessions)
    .values({ readerId, artifactId, textHash: text.textHash, mode })
    .returning({ id: readingSessions.id });
  return row.id;
}

export async function latestText(db: Db, artifactId: string) {
  const rows = await db
    .select()
    .from(artifactTexts)
    .where(eq(artifactTexts.artifactId, artifactId))
    .orderBy(desc(artifactTexts.version))
    .limit(1);
  return rows[0] ?? null;
}

export interface ReadingView {
  artifactId: string;
  textHash: string;
  canonicalText: string;
  title: string;
  sourceFormat: string;
  annotations: AnnotationRow[];
}

/** The text to render and every annotation standing on it — from any
 *  session, since a highlight outlives the sitting that made it. */
export async function readingView(db: Db, artifactId: string): Promise<ReadingView | null> {
  const text = await latestText(db, artifactId);
  if (!text) return null;
  const [doc] = await db.select({ title: document.title }).from(document).where(eq(document.id, artifactId));
  const rows = await db
    .select()
    .from(annotations)
    .where(eq(annotations.textHash, text.textHash))
    .orderBy(annotations.startOff);
  return {
    artifactId,
    textHash: text.textHash,
    canonicalText: text.canonicalText,
    title: doc?.title ?? "Untitled",
    sourceFormat: text.sourceFormat,
    annotations: rows,
  };
}

/** Stamp the end of a sitting. Returns null when it was already ended or
 *  never existed, so a double submit does its work once. */
export async function stampEnded(db: Db, sessionId: string) {
  const [row] = await db
    .update(readingSessions)
    .set({ endedAt: new Date() })
    .where(and(eq(readingSessions.id, sessionId), sql`${readingSessions.endedAt} is null`))
    .returning();
  return row ?? null;
}

export interface AnnotationListing extends AnnotationRow {
  artifactId: string;
  title: string;
  mode: ReadingMode;
}

/** Newest first, with the artifact and the session's mode beside each row. */
export async function listAnnotations(
  db: Db,
  filter: { tag?: string; artifactId?: string } = {},
): Promise<AnnotationListing[]> {
  const where = [
    filter.tag ? eq(annotations.tag, filter.tag) : undefined,
    filter.artifactId ? eq(readingSessions.artifactId, filter.artifactId) : undefined,
  ].filter(Boolean);

  const rows = await db
    .select({
      annotation: annotations,
      artifactId: readingSessions.artifactId,
      mode: readingSessions.mode,
      title: document.title,
    })
    .from(annotations)
    .innerJoin(readingSessions, eq(annotations.sessionId, readingSessions.id))
    .leftJoin(document, eq(document.id, readingSessions.artifactId))
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(annotations.createdAt));

  return rows.map((row) => ({
    ...row.annotation,
    artifactId: row.artifactId,
    title: row.title ?? "Untitled",
    mode: row.mode,
  }));
}

/** Every tag the map knows about, for the filter control. */
export async function annotatedTags(db: Db): Promise<string[]> {
  const rows = await db.selectDistinct({ tag: annotations.tag }).from(annotations);
  return rows.map((r) => r.tag).sort();
}

/** Titles for a set of artifacts, for a listing that has ids and needs
 *  names. */
export async function titlesOf(db: Db, artifactIds: string[]): Promise<Map<string, string>> {
  if (artifactIds.length === 0) return new Map();
  const rows = await db
    .select({ id: document.id, title: document.title })
    .from(document)
    .where(inArray(document.id, artifactIds));
  return new Map(rows.map((r) => [r.id, r.title ?? "Untitled"]));
}
