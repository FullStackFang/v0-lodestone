import { getDb } from "@/db/client";
import { meView } from "@/harness/founder/me";
import { requirePerson } from "@/lib/session";
import { ProfileContent } from "./profile-content";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const db = await getDb();
  const person = await requirePerson(db);
  return <ProfileContent view={await meView(db, person.id)} />;
}
