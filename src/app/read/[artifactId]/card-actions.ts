"use server";

/** The two costly actions on a card, and no third.
 *
 * Open or Save is `requested`; Dismiss is `dismissed`. There is no Accept:
 * a free click makes a log of politeness, and the tuning data would be
 * worth nothing. Both refuse without a `match_result_id` — a judgment about
 * a result nobody was shown is not a judgment. */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { requireCurator } from "@/resources/curator";
import { matchParams, matchResults } from "@/db/schema";
import { readerPerson } from "@/harness/ledger";
import { judgeResult } from "@/harness/papers/judge";

export async function judgeCard(formData: FormData): Promise<void> {
  const db = await getDb();
  await requireCurator(db);
  const matchResultId = String(formData.get("matchResultId") ?? "");
  const verdict = String(formData.get("verdict") ?? "");
  const sessionId = String(formData.get("sessionId") ?? "");
  const openUrl = String(formData.get("url") ?? "");
  if (verdict !== "requested" && verdict !== "dismissed") return;

  const [result] = await db.select().from(matchResults).where(eq(matchResults.id, matchResultId));
  // Recorded beside the verdict so a re-tuning can tell which parameters
  // produced the ordering the reader was judging.
  const [params] = result
    ? await db.select().from(matchParams).where(eq(matchParams.edgeType, result.edgeType))
    : [];

  await judgeResult(db, {
    matchResultId,
    readerId: await readerPerson(db),
    verdict,
    sessionId: sessionId || null,
    parameters: { lambda: params?.lambda ?? null, mu: params?.mu ?? null },
  });

  if (verdict === "requested" && openUrl) redirect(openUrl);
  revalidatePath("/read", "layout");
}
