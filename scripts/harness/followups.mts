/** `npm run followups` — introductions old enough to ask about.
 *
 *  The list `/me` turns into one question per introduction. A human runs
 *  this to see who is owed one; the asking happens on the page. */
// Must come first: modules below read `process.env` when they load.
import "./env.mts";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../src/db/client";
import { matchResults, person } from "../../src/db/schema";
import { pendingFollowUps } from "../../src/harness/founder/intro";

const days = Number(process.argv[2] ?? 7);
const db = await getDb();
const pending = await pendingFollowUps(db, days);

if (pending.length === 0) {
  console.log(`no introductions older than ${days} days are waiting on an answer`);
  process.exit(0);
}

const results = await db
  .select()
  .from(matchResults)
  .where(inArray(matchResults.id, pending.map((j) => j.matchResultId)));
const byResult = new Map(results.map((r) => [r.id, r]));

for (const judgment of pending) {
  const result = byResult.get(judgment.matchResultId);
  const [reader] = await db.select().from(person).where(eq(person.id, judgment.readerId)).limit(1);
  const [candidate] = result
    ? await db.select().from(person).where(eq(person.id, result.candidateSubjectId)).limit(1)
    : [undefined];
  console.log(
    `${reader?.name ?? judgment.readerId} → ${candidate?.name ?? "?"} · ` +
      `${judgment.createdAt.toISOString().slice(0, 10)} · result ${judgment.matchResultId}`,
  );
}
console.log(`\n${pending.length} introduction(s) waiting on "did it help?"`);
process.exit(0);
