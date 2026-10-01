/** Which subject a row belongs to.
 *
 * Two kinds and no new table: an idea is a `thesis_card`, a person is a
 * `person`. The walk from a card to its founder goes through the session,
 * which is why a legacy session — one from before intake asked — yields
 * `null` and every adapter files idea rows only rather than throwing.
 */
import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { session, thesisCard } from "@/db/schema";
import type { SubjectType } from "../schema";

export interface Subject {
  subjectType: SubjectType;
  subjectId: string;
}

export function ideaSubject(cardId: string): Subject {
  return { subjectType: "idea", subjectId: cardId };
}

export function personSubject(personId: string): Subject {
  return { subjectType: "person", subjectId: personId };
}

/** The founder behind a card: `card.session_id → session.person_id`. Null
 *  when the session predates the person step. */
export async function personOf(db: Db, cardId: string): Promise<string | null> {
  const rows = await db
    .select({ personId: session.personId })
    .from(thesisCard)
    .innerJoin(session, eq(thesisCard.sessionId, session.id))
    .where(eq(thesisCard.id, cardId))
    .limit(1);
  return rows[0]?.personId ?? null;
}

/** Every card the person has started, across every session of theirs —
 *  oldest first. Two browsers are one founder, so this is the set a query
 *  excludes as "self" and the set `/me` reads. */
export async function ideasOf(db: Db, personId: string): Promise<string[]> {
  const sessions = await db
    .select({ id: session.id })
    .from(session)
    .where(eq(session.personId, personId));
  if (sessions.length === 0) return [];
  const rows = await db
    .select({ id: thesisCard.id, createdAt: thesisCard.createdAt })
    .from(thesisCard)
    .where(
      inArray(
        thesisCard.sessionId,
        sessions.map((s) => s.id),
      ),
    );
  return rows
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((r) => r.id);
}
