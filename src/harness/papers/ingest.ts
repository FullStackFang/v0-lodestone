/** An identifier in, a hashed canonical text out.
 *
 * A paper is a `document` thesis-forge already understands — `source =
 * 'paper'`, and `session_id = null` because a paper has no student. The
 * contract made that column nullable for exactly this.
 *
 * Idempotency is on the canonical text, not on the identifier: two DOIs that
 * resolve to one abstract are one `artifact_texts` row and one `document`.
 * The existing row is looked up *before* the document is inserted, so a
 * second ingest cannot leave an orphan document behind. */
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { artifactTexts, document } from "@/db/schema";
import { hashText, normalize, putArtifactText } from "../canonical";
import {
  fetchWork,
  provenanceOf,
  rebuildAbstract,
  titleOf,
  type OpenAlexWork,
  type PaperProvenance,
} from "./openalex";

export const PARSER = "openalex-abstract-v1";

export type IngestStatus = "ok" | "no_abstract" | "not_found";

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
  const fetcher = deps.fetchWork ?? ((id: string) => fetchWork(id));
  const work = await fetcher(identifier);
  if (!work) return { identifier, status: "not_found" };

  const rebuilt = rebuildAbstract(work.abstract_inverted_index);
  if (rebuilt === null) return { identifier, status: "no_abstract" };

  const canonical = normalize(rebuilt);
  const textHash = hashText(canonical);
  const title = titleOf(work);
  const provenance = provenanceOf(work);

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

  const [row] = await db
    .insert(document)
    .values({ sessionId: null, source: "paper", title, text: canonical })
    .returning({ id: document.id });

  const put = await putArtifactText(db, {
    artifactId: row.id,
    sourceFormat: "abstract",
    parser: PARSER,
    text: canonical,
    provenance,
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
export function ingestLine(result: IngestResult): string {
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
