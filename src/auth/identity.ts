import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { person, pilotMembership, session } from "@/db/schema";
import { ensurePerson } from "@/harness/ledger";

type VerifiedSession = { user: { id: string; email: string; name: string; emailVerified: boolean }; session: { id: string } };

/** Only a verified auth-library result may enter this bridge. Legacy cookies never do.
 *  Every request after the first finds its row and only reads; the first
 *  files the person and the row, and two racing first requests both land on
 *  the one row the unique `auth_session_id` keeps. The person's membership
 *  row comes back in the same read, null when they were never enrolled. */
export async function verifiedContext(db: Db, authenticated: VerifiedSession | null) {
  if (!authenticated?.user.emailVerified) return null;
  const authSessionId = authenticated.session.id;
  const read = async () => (await db.select({ id: session.id, person: person, membership: pilotMembership }).from(session)
    .innerJoin(person, eq(session.personId, person.id))
    .leftJoin(pilotMembership, eq(pilotMembership.personId, person.id))
    .where(eq(session.authSessionId, authSessionId)).limit(1))[0];
  // The key `ensurePerson` files under; `person.email` is unique, so a row
  // under another address is another person.
  const email = authenticated.user.email.trim().toLowerCase();
  let row = await read();
  if (!row) {
    const personId = await ensurePerson(db, { name: authenticated.user.name, email });
    await db.insert(session).values({ personId, authSessionId }).onConflictDoNothing({ target: session.authSessionId });
    row = await read();
  }
  if (!row || row.person.email !== email) throw new Error("Authentication session ownership mismatch.");
  return { sessionId: row.id, person: row.person, membership: row.membership };
}
