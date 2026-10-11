/** Who the token is, and what the network holds. The connection test a
 *  client runs after pasting a token. */
import { NextResponse } from "next/server";
import { cohortCounts } from "@/lodestone/cards";
import { corpusSize } from "@/lodestone/priorArt";
import { isActiveMember } from "@/pilot/membership";
import { withToken } from "../client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withToken(request, async (db, person) => {
    const [member, counts, corpus] = await Promise.all([isActiveMember(db, person.id), cohortCounts(db), corpusSize(db)]);
    return NextResponse.json({
      person: { id: person.id, name: person.name, email: person.email },
      member,
      cohort: counts,
      corpus,
    });
  });
}
