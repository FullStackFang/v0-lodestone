/** Send the weekly digest to every member who owns a card. Shared by the
 *  cron route and the local script. Retrieval and ranking only; no model. */
import { eq } from "drizzle-orm";
import { deliverEmail } from "@/auth/delivery";
import type { Db } from "@/db/client";
import { forgeCard } from "@/db/lodestone-schema";
import { person } from "@/db/schema";
import { DIGEST_DAYS, digestFor, renderDigest } from "./digest";

export interface DeliveryReport {
  since: Date;
  sent: { email: string; cards: number; newCards: number }[];
}

export async function sendDigests(db: Db, options: { days?: number; origin: string; now?: Date } = { origin: "" }): Promise<DeliveryReport> {
  const now = options.now ?? new Date();
  const days = options.days ?? DIGEST_DAYS;
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const owners = await db.selectDistinct({ id: person.id, email: person.email })
    .from(forgeCard).innerJoin(person, eq(person.id, forgeCard.ownerId));
  const sent: DeliveryReport["sent"] = [];
  for (const owner of owners) {
    const digest = await digestFor(db, owner.id, since, now);
    await deliverEmail({
      email: owner.email,
      subject: `Lodestone digest · ${since.toISOString().slice(0, 10)}`,
      text: renderDigest(digest, options.origin),
    });
    sent.push({ email: owner.email, cards: digest.sections.length, newCards: digest.newCards });
  }
  return { since, sent };
}
