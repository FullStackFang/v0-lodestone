import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { person, session } from "@/db/schema";
import { ensurePerson } from "@/harness/ledger";

type VerifiedSession = { user: { id: string; email: string; name: string; emailVerified: boolean }; session: { id: string } };

/** Only a verified auth-library result may enter this bridge. Legacy cookies never do. */
export async function verifiedContext(db: Db, authenticated: VerifiedSession | null) {
  if (!authenticated?.user.emailVerified) return null;
  const personId = await ensurePerson(db, { name: authenticated.user.name, email: authenticated.user.email.toLowerCase() });
  await db.insert(session).values({ personId, authSessionId: authenticated.session.id }).onConflictDoNothing({ target: session.authSessionId });
  const [row] = await db.select({ id: session.id, person: person }).from(session)
    .innerJoin(person, eq(session.personId, person.id)).where(eq(session.authSessionId, authenticated.session.id)).limit(1);
  if (!row || row.person.id !== personId) throw new Error("Authentication session ownership mismatch.");
  return { sessionId: row.id, person: row.person };
}
