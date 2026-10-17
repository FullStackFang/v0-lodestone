/** The one reading of record. `NORMALIZATION.md` is the specification and
 *  this file is its only implementation; the two are checked against each
 *  other by a fixture whose hash is recorded byte for byte.
 *
 *  Offsets into a canonical text are UTF-16 code units. Nothing here slices
 *  in SQL, and `canonical.test.ts` greps to keep it that way. */
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { artifactTexts } from "@/db/schema";
import type { SourceFormat } from "./schema";

/** Zero-width space, soft hyphen, byte-order mark. Rendering hints, not
 *  content — and a soft hyphen inside a word makes a quote unmatchable. */
const INVISIBLE = /[\u200B\u00AD\uFEFF]/g;

/** Turns are joined by a mark normalization does not collapse and no
 *  founder types, so a quote can never straddle one by accident. */
export const TURN_SEPARATOR = " ¶ ";

/** NFC, invisibles out, whitespace collapsed, trimmed. In that order: NFC
 *  first because composition changes once invisibles are gone, whitespace
 *  last because a removed soft hyphen can leave two spaces adjacent. */
export function normalize(text: string): string {
  return text.normalize("NFC").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}

/** Lowercase hex sha256 of the UTF-8 bytes of the normalized text. */
export function hashText(text: string): string {
  return createHash("sha256").update(normalize(text), "utf8").digest("hex");
}

export interface PutArtifactTextInput {
  artifactId: string;
  sourceFormat: SourceFormat;
  /** Names the extraction that produced this reading. A change to the
   *  normalization rule is a new parser name, never an edit in place. */
  parser: string;
  text: string;
  provenance?: Record<string, unknown>;
}

export interface PutArtifactTextResult {
  id: string;
  textHash: string;
  version: number;
  created: boolean;
  /** Set when the hash already existed under a different artifact — two
   *  DOIs resolving to one abstract. The existing row is returned unchanged. */
  sharedWith?: string;
}

/** Idempotent on the hash. A second put of the same text writes nothing; a
 *  put of *different* text for the same artifact is a re-parse and gets the
 *  next version. */
export async function putArtifactText(
  db: Db,
  input: PutArtifactTextInput,
): Promise<PutArtifactTextResult> {
  const canonical = normalize(input.text);
  const textHash = hashText(canonical);

  const existing = await db
    .select({
      id: artifactTexts.id,
      artifactId: artifactTexts.artifactId,
      version: artifactTexts.version,
    })
    .from(artifactTexts)
    .where(eq(artifactTexts.textHash, textHash))
    .limit(1);

  if (existing[0]) {
    const row = existing[0];
    return {
      id: row.id,
      textHash,
      version: row.version,
      created: false,
      ...(row.artifactId === input.artifactId ? {} : { sharedWith: row.artifactId }),
    };
  }

  const latest = await db
    .select({ version: artifactTexts.version })
    .from(artifactTexts)
    .where(eq(artifactTexts.artifactId, input.artifactId))
    .orderBy(desc(artifactTexts.version))
    .limit(1);
  const version = (latest[0]?.version ?? 0) + 1;

  const [row] = await db
    .insert(artifactTexts)
    .values({
      artifactId: input.artifactId,
      version,
      canonicalText: canonical,
      textHash,
      parser: input.parser,
      sourceFormat: input.sourceFormat,
      provenance: input.provenance ?? {},
    })
    .returning({ id: artifactTexts.id });

  return { id: row.id, textHash, version, created: true };
}

/** The canonical text for a hash, or null. The one loader — every slice in
 *  the harness happens on the string this returns. */
export async function getCanonicalText(db: Db, textHash: string): Promise<string | null> {
  const rows = await db
    .select({ canonicalText: artifactTexts.canonicalText })
    .from(artifactTexts)
    .where(eq(artifactTexts.textHash, textHash))
    .limit(1);
  return rows[0]?.canonicalText ?? null;
}

/** The newest reading of an artifact, for a caller that has an id but not a
 *  hash. */
export async function latestArtifactText(db: Db, artifactId: string, sourceFormat?: SourceFormat) {
  const where = sourceFormat
    ? and(eq(artifactTexts.artifactId, artifactId), eq(artifactTexts.sourceFormat, sourceFormat))
    : eq(artifactTexts.artifactId, artifactId);
  const rows = await db
    .select()
    .from(artifactTexts)
    .where(where)
    .orderBy(desc(artifactTexts.version))
    .limit(1);
  return rows[0] ?? null;
}
