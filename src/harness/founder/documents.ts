/** A deck and a resume, through the canonical text path.
 *
 * The two doors already store what the founder pasted as a `document`; this
 * is the second half of that — the text gets one canonical reading, and the
 * variant that matches the source reads it. The selectors are the point: a
 * claim on a founder's record has to be traceable to the line that made it.
 *
 * Scheduled the same way the conversation adapter is, so a founder waits
 * for the thread rather than for the ledger.
 */
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { document, type ExtractionRunRow } from "@/db/schema";
import { putArtifactText } from "../canonical";
import { extract, type ExtractDeps } from "../extract/core";
import { personOf } from "./subjects";

/** `paper` has no variant here — that is the papers track's `abstract`. */
const VARIANT = { deck: "deck", resume: "resume" } as const;

/**
 * Ingest one `document` row: canonical text, then the variant that matches
 * its source.
 *
 * Returns the run, or null for a document this track has no variant for.
 * The card is the idea subject; the session's person is the person subject,
 * and a legacy session yields idea rows only.
 */
export async function ingestDocument(
  db: Db,
  documentId: string,
  cardId: string,
  deps: ExtractDeps = {},
): Promise<ExtractionRunRow | null> {
  const rows = await db.select().from(document).where(eq(document.id, documentId)).limit(1);
  const doc = rows[0];
  if (!doc) return null;
  const variant = VARIANT[doc.source as keyof typeof VARIANT];
  if (!variant) return null;
  if (doc.text.trim() === "") return null;

  const personId = await personOf(db, cardId);
  const { textHash } = await putArtifactText(db, {
    artifactId: documentId,
    sourceFormat: doc.source === "deck" ? "deck" : "resume",
    parser: "document-text-v1",
    text: doc.text,
    provenance: { document_id: documentId, title: doc.title },
  });

  return extract(
    db,
    {
      textHash,
      variant,
      subjects: personId ? { idea: cardId, person: personId } : { idea: cardId },
      provenance: { kind: "document", document_id: documentId, text_hash: textHash },
      sourceType: variant,
      sourceArtifactId: documentId,
    },
    deps,
  );
}
