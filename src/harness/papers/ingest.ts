/** An identifier in, a hashed canonical text out.
 *
 * A paper is a `document` whetstone already understands — `source =
 * 'paper'`, and `session_id = null` because a paper has no student. The
 * contract made that column nullable for exactly this.
 *
 * Idempotency is first on the source's own id — a DOI or OpenAlex id already
 * in provenance is answered from the stored row, before any fetch where the
 * identifier allows — and then on the canonical text: two DOIs that
 * resolve to one abstract are one `artifact_texts` row and one `document`.
 * The existing row is looked up *before* the document is inserted, so a
 * second ingest cannot leave an orphan document behind. */
import { eq, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import { artifactTexts, document } from "@/db/schema";
import { hashText, normalize, putArtifactText } from "../canonical";
import {
  doiOf,
  fetchWork,
  provenanceOf,
  rebuildAbstract,
  titleOf,
  type OpenAlexWork,
  type PaperProvenance,
} from "./openalex";

export const PARSER = "openalex-abstract-v1";

export type IngestStatus = "ok" | "no_abstract" | "short_abstract" | "not_found";

/** Below this many words an "abstract" is a subject tag or a fragment —
 *  "Digital", "International audience" — and its vector sits near every card.
 *  The shortest hand-written seed abstract is 34 words. */
export const MIN_ABSTRACT_WORDS = 30;

export function wordCount(text: string): number {
  return text.split(" ").filter((w) => w.length > 0).length;
}

export interface IngestResult {
  identifier: string;
  status: IngestStatus;
  artifactId?: string;
  textHash?: string;
  /** False when the text was already in the ledger under some artifact. */
  created?: boolean;
  /** The artifact that already owned this text, when one did. */
  sharedWith?: string;
  title?: string | null;
  provenance?: PaperProvenance;
}

export interface IngestDeps {
  fetchWork?: (identifier: string) => Promise<OpenAlexWork | null>;
  /** Merged into the stored provenance — the query set a work came from. */
  provenance?: Record<string, unknown>;
  /** Refuse an abstract shorter than this as `short_abstract`. Off by default;
   *  the ingest command passes `MIN_ABSTRACT_WORDS`. */
  minWords?: number;
}

/** The ids a source gives a work, as `artifact_texts.provenance` stores them. */
export interface SourceKeys {
  openalex_id?: string | null;
  doi?: string | null;
  patent_number?: string | null;
}

/** The stored row any of these ids already names, or null. Checked before a
 *  fetch where the identifier allows it, and always before a write; the
 *  unique indexes on the same keys back it at the database. */
export async function storedBySourceId(
  db: Db,
  keys: SourceKeys,
): Promise<{ artifactId: string; textHash: string } | null> {
  const p = sql`${artifactTexts.provenance}`;
  const match: SQL[] = [];
  if (keys.openalex_id) match.push(sql`${p}->>'openalex_id' = ${keys.openalex_id}`);
  if (keys.doi) match.push(sql`lower(${p}->>'doi') = ${keys.doi.toLowerCase()}`);
  if (keys.patent_number) match.push(sql`${p}->>'patent_number' = ${keys.patent_number}`);
  if (match.length === 0) return null;
  const [row] = await db
    .select({ artifactId: artifactTexts.artifactId, textHash: artifactTexts.textHash })
    .from(artifactTexts)
    .where(or(...match))
    .limit(1);
  return row ?? null;
}

/** The keys an identifier names before anything is fetched: a DOI, or an
 *  OpenAlex id in the URL form OpenAlex stores. */
function keysOf(identifier: string): SourceKeys {
  const id = identifier.trim();
  const doi = doiOf(id);
  if (doi) return { doi };
  const w = /^(?:https?:\/\/openalex\.org\/)?(W\d+)$/i.exec(id);
  return w ? { openalex_id: `https://openalex.org/${w[1].toUpperCase()}` } : {};
}

/**
 * Fetch a work, rebuild its abstract, and write the `document` +
 * `artifact_texts` pair.
 *
 * A work OpenAlex does not know is `not_found`; a work whose abstract the
 * publisher withheld is `no_abstract`. Neither writes anything, and neither
 * throws — the batch continues.
 */
export async function ingestWork(
  db: Db,
  identifier: string,
  deps: IngestDeps = {},
): Promise<IngestResult> {
  // A work already held by this id costs no request.
  const held = await storedBySourceId(db, keysOf(identifier));
  if (held) return { identifier, status: "ok", ...held, created: false };

  const fetcher = deps.fetchWork ?? ((id: string) => fetchWork(id));
  const work = await fetcher(identifier);
  if (!work) return { identifier, status: "not_found" };

  const title = titleOf(work);
  const provenance: PaperProvenance = { ...provenanceOf(work), ...deps.provenance };

  // The work's own ids, which a search result or a DOI lookup only knows
  // now. Checked before the abstract: a stored work is the stored work even
  // if OpenAlex has since edited its index.
  const known = await storedBySourceId(db, provenance);
  if (known) return { identifier, status: "ok", ...known, created: false, title, provenance };

  const rebuilt = rebuildAbstract(work.abstract_inverted_index);
  if (rebuilt === null) return { identifier, status: "no_abstract" };

  const canonical = normalize(rebuilt);
  if (wordCount(canonical) < (deps.minWords ?? 0)) return { identifier, status: "short_abstract", title, provenance };
  const textHash = hashText(canonical);

  // Before the document row: an existing text means this abstract already
  // has an artifact, and a second document for it would be a duplicate the
  // reading list shows twice.
  const existing = await db
    .select({ artifactId: artifactTexts.artifactId })
    .from(artifactTexts)
    .where(eq(artifactTexts.textHash, textHash))
    .limit(1);
  if (existing[0]) {
    return {
      identifier,
      status: "ok",
      artifactId: existing[0].artifactId,
      textHash,
      created: false,
      sharedWith: existing[0].artifactId,
      title,
      provenance,
    };
  }

  // One transaction: a text the unique indexes refuse must not leave its
  // document behind, unembedded-then-ranked with no provenance.
  const { row, put } = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(document)
      .values({ sessionId: null, source: "paper", title, text: null })
      .returning({ id: document.id });
    const put = await putArtifactText(tx, {
      artifactId: row.id,
      sourceFormat: "abstract",
      parser: PARSER,
      text: canonical,
      provenance,
    });
    return { row, put };
  });

  return {
    identifier,
    status: "ok",
    artifactId: row.id,
    textHash: put.textHash,
    created: put.created,
    sharedWith: put.sharedWith,
    title,
    provenance,
  };
}

/** `<identifier> <artifact_id> <text_hash>`, or `<identifier> no_abstract`. */
export function ingestLine(result: Pick<IngestResult, "identifier" | "status" | "artifactId" | "textHash">): string {
  if (result.status !== "ok") return `${result.identifier} ${result.status}`;
  return `${result.identifier} ${result.artifactId} ${result.textHash}`;
}

/** One identifier per line; `#` comments and blank lines ignored. */
export function parseList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter((line) => line.length > 0);
}
