/** `npm run lodestone:digest -- [--days 7] [--origin http://localhost:3000]`
 *
 * Render this week's digest for every member who has a card and hand it to
 * the mail path: Resend when configured, otherwise `data/auth/outbox.jsonl`.
 * Honours `DATABASE_URL`; without it opens the local PGlite directory, which
 * `next dev` must not hold at the same time. In production the cron route
 * `/api/lodestone/digest` does this instead. */
import "../harness/env.mts";
import { getDb } from "../../src/db/client";
import { sendDigests } from "../../src/lodestone/deliver";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1] ?? fallback;
};

const db = await getDb();
const report = await sendDigests(db, { days: Number(flag("--days", "7")), origin: flag("--origin", "http://localhost:3000") });
for (const s of report.sent) console.log(`${s.email}: ${s.cards} card(s), ${s.newCards} new in the cohort`);
console.log(`${report.sent.length} digest(s) handed to delivery.`);
process.exit(0);
