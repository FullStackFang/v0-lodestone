"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { requirePerson } from "@/lib/session";
import { mintToken, revokeToken } from "@/lodestone/api";
import type { ActionState } from "@/review/ActionForm";

const read = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const describe = (error: unknown) => (error instanceof Error ? error.message : "The change could not be saved.");

/** Mint a token for a client. The plaintext goes back in the message, once. */
export async function mintApiToken(_previous: ActionState, data: FormData): Promise<ActionState> {
  const db = await getDb();
  const person = await requirePerson(db);
  try {
    const { token, row } = await mintToken(db, person.id, read(data, "label"));
    revalidatePath("/lodestone/tokens");
    return { message: `Token “${row.label}” created. Copy it now; it is not shown again:\n${token}` };
  } catch (error) {
    return { error: describe(error) };
  }
}

export async function revokeApiToken(_previous: ActionState, data: FormData): Promise<ActionState> {
  const db = await getDb();
  const person = await requirePerson(db);
  try {
    const id = z.string().uuid().parse(read(data, "id"));
    const row = await revokeToken(db, person.id, id);
    revalidatePath("/lodestone/tokens");
    return { message: `Token “${row.label}” revoked. A client still holding it is signed out.` };
  } catch (error) {
    return { error: describe(error) };
  }
}
