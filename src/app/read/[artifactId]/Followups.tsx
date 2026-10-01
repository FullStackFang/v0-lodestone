/** Last sitting's opened papers, asked about once.
 *
 * One line each, two answers and no third. Skipping is allowed and is
 * final: the question belongs to the session that follows the one that
 * raised it, and never comes back. */
import { getDb } from "@/db/client";
import { pendingFollowups } from "@/harness/papers/followups";
import { readerPerson } from "@/harness/ledger";
import { answerFollowup } from "./followup-actions";

export async function Followups({ sessionId }: { sessionId: string }) {
  const db = await getDb();
  const readerId = await readerPerson(db);
  const rows = await pendingFollowups(db, readerId, sessionId);
  if (rows.length === 0) return null;

  return (
    <section className="card" style={{ marginBottom: 18 }}>
      <span className="eyebrow">Last time</span>
      {rows.map((row) => (
        <form key={row.matchResultId} action={answerFollowup} className="absence" style={{ marginTop: 6 }}>
          <input type="hidden" name="matchResultId" value={row.matchResultId} />
          <span style={{ flex: 1 }}>Did “{row.title}” help?</span>
          <button className="button outline" name="verdict" value="helped" type="submit">
            it helped
          </button>
          <button className="button outline" name="verdict" value="not_helpful" type="submit">
            it did not
          </button>
        </form>
      ))}
    </section>
  );
}
