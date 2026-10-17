/** Claiming an extraction run: the newest cached run for a key, or a new
 *  pending attempt. A leaf: it loads no model and no embedder, so a caller
 *  that only files rows (the Forge import) can claim a run without the SDK.
 *  `core.ts` re-exports all of it. */
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { artifactTexts, extractionRuns, type ExtractionRunRow } from "@/db/schema";
import type { embed } from "../embed";
import type { structured } from "../model";

export interface ExtractDeps {
  structured?: typeof structured;
  embed?: typeof embed;
}

export type RunKey = Pick<ExtractionRunRow, "textHash" | "variant" | "promptVersion" | "model" | "attributionKey">;

/** The newest `ok` or `pending` run for the key. A `failed` row is never a cache
 *  hit: the next call retries it at a new attempt without `force`. */
async function cachedRun(
  db: Db,
  key: RunKey,
): Promise<ExtractionRunRow | null> {
  const rows = await db
    .select()
    .from(extractionRuns)
    .where(
      and(
        eq(extractionRuns.textHash, key.textHash),
        eq(extractionRuns.variant, key.variant),
        eq(extractionRuns.promptVersion, key.promptVersion),
        eq(extractionRuns.model, key.model),
        eq(extractionRuns.attributionKey, key.attributionKey),
        inArray(extractionRuns.status, ["ok", "pending"]),
      ),
    )
    .orderBy(desc(extractionRuns.attempt))
    .limit(1);
  return rows[0] ?? null;
}

async function nextAttempt(
  db: Db,
  key: RunKey,
): Promise<number> {
  const rows = await db
    .select({ attempt: extractionRuns.attempt })
    .from(extractionRuns)
    .where(
      and(
        eq(extractionRuns.textHash, key.textHash),
        eq(extractionRuns.variant, key.variant),
        eq(extractionRuns.promptVersion, key.promptVersion),
        eq(extractionRuns.model, key.model),
        eq(extractionRuns.attributionKey, key.attributionKey),
      ),
    )
    .orderBy(desc(extractionRuns.attempt))
    .limit(1);
  return (rows[0]?.attempt ?? 0) + 1;
}

/** Share scoped attempt claiming with derived passes without holding a model-call lock. */
export async function claimExtractionRun(db: Db, key: RunKey, coreVersion: string, force = false) {
  return db.transaction(async (tx) => {
    await tx.select({ id: artifactTexts.id }).from(artifactTexts)
      .where(eq(artifactTexts.textHash, key.textHash)).for("update");
    if (!force) {
      const cached = await cachedRun(tx, key);
      if (cached) return { run: cached, cached: true };
    }
    const attempt = await nextAttempt(tx, key);
    const [run] = await tx.insert(extractionRuns)
      .values({ ...key, coreVersion, attempt, status: "pending" })
      .returning();
    return { run, cached: false };
  });
}
