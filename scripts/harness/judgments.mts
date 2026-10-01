/** `npm run judgments` — the costly signals, newest first.
 *
 *  A judgment is the only thing this system collects that cost anybody
 *  anything, so there is a command that prints them without a query
 *  console. */
// Must come first: modules below read `process.env` when they load.
import "./env.mts";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../src/db/client";
import { assertions, judgments, person } from "../../src/db/schema";

const db = await getDb();
const rows = await db.select().from(judgments).orderBy(desc(judgments.createdAt)).limit(20);

if (rows.length === 0) {
  console.log("no judgments yet");
  process.exit(0);
}

for (const row of rows) {
  const [reader] = await db.select().from(person).where(eq(person.id, row.readerId)).limit(1);
  const [candidate] = await db.select().from(person).where(eq(person.id, row.candidateSubjectId)).limit(1);
  const [asked] = await db.select().from(assertions).where(eq(assertions.id, row.queryAssertionId)).limit(1);
  console.log(
    [
      `${row.verdict} · ${row.edgeType} · rank ${row.rank}`,
      `  ${reader?.name ?? row.readerId} → ${candidate?.name ?? row.candidateSubjectId}`,
      `  match_result: ${row.matchResultId}`,
      `  query assertion: ${asked ? `${asked.facet} — ${asked.text.slice(0, 70)}` : row.queryAssertionId}`,
      `  candidate assertions: ${row.candidateAssertionIds.length}`,
      `  delivered: ${(row.context as { delivered?: string }).delivered ?? "—"}`,
    ].join("\n"),
  );
}
console.log(`\n${rows.length} judgment(s)`);
process.exit(0);
