"use server";

/** The follow-up answer: a second judgment on the row the first was about. */
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { requireCurator } from "@/resources/curator";
import { judgments } from "@/db/schema";
import { recordFollowup } from "@/harness/papers/followups";
import { readerPerson } from "@/harness/ledger";

export async function answerFollowup(formData: FormData): Promise<void> {
  const db = await getDb();
  await requireCurator(db);
  const matchResultId = String(formData.get("matchResultId") ?? "");
  const verdict = String(formData.get("verdict") ?? "");
  if (!matchResultId) return;
  if (verdict !== "helped" && verdict !== "not_helpful") return;

  const readerId = await readerPerson(db);
  const rows = await db
    .select()
    .from(judgments)
    .where(and(eq(judgments.matchResultId, matchResultId), eq(judgments.verdict, "requested")))
    .limit(1);
  const first = rows[0];
  if (!first) return;

  await recordFollowup(
    db,
    readerId,
    {
      matchResultId: first.matchResultId,
      edgeType: first.edgeType,
      rank: first.rank,
      queryAssertionId: first.queryAssertionId,
      candidateSubjectId: first.candidateSubjectId,
      candidateAssertionIds: first.candidateAssertionIds,
    },
    verdict,
  );
  revalidatePath("/read", "layout");
}
