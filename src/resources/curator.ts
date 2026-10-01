import type { Db } from "@/db/client";
import { getDb } from "@/db/client";
import { requirePerson } from "@/lib/session";
import { assertCurator } from "./service";

export async function requireCurator(db?: Db) {
  const database = db ?? await getDb();
  const person = await requirePerson(database);
  return assertCurator(database, person.id);
}
