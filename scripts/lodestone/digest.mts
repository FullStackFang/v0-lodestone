/** `npm run lodestone:digest -- [--days 7] [--origin http://localhost:3000]`
 *
 * Render this week's digest for every member who has a card and hand it to
 * the mail path: Resend when configured, otherwise `data/auth/outbox.jsonl`.
 * Retrieval and ranking only; no model is called. Run it from a weekly
 * scheduler, or by hand. Do not run while `next dev` holds the database. */
import "../harness/env.mts";
import path from "node:path";
import { eq } from "drizzle-orm";
import { deliverEmail } from "../../src/auth/delivery";
import { createPgliteDb } from "../../src/db/client";
import { forgeCard } from "../../src/db/lodestone-schema";
import { person } from "../../src/db/schema";
import { digestFor, renderDigest } from "../../src/lodestone/digest";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1] ?? fallback;
};
const days = Number(flag("--days", "7"));
const origin = flag("--origin", "http://localhost:3000");

const db = await createPgliteDb(path.resolve(process.cwd(), process.env.THESIS_DATA_DIR || "data/pglite"));
const now = new Date();
const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

const owners = await db.selectDistinct({ id: person.id, email: person.email, name: person.name })
  .from(forgeCard).innerJoin(person, eq(person.id, forgeCard.ownerId));
let sent = 0;
for (const owner of owners) {
  const digest = await digestFor(db, owner.id, since, now);
  const text = renderDigest(digest, origin);
  await deliverEmail({ email: owner.email, subject: `Lodestone digest · ${since.toISOString().slice(0, 10)}`, text });
  sent += 1;
  console.log(`${owner.email}: ${digest.sections.length} card(s), ${digest.newCards} new in the cohort`);
}
console.log(`${sent} digest(s) handed to delivery.`);
process.exit(0);
