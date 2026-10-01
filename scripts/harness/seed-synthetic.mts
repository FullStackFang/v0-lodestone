/** `npm run seed:synthetic` — twelve synthetic founders through the real
 *  write path. The work is in `src/harness/founder/seed.ts` so the bench and
 *  the tests can call it without spawning a process.
 *
 *  Scripted by default (no cost, deterministic). `SEED_REAL=1` runs the
 *  engine instead, which costs one extraction per resume and per turn. */
// Must come first: modules below read `process.env` when they load.
import "./env.mts";
import { getDb } from "../../src/db/client";
import { seedSynthetic } from "../../src/harness/founder/seed";
import { syntheticScript } from "../../src/harness/founder/synthetic-script";

// Deliberately *not* VITEST: that flag also sends `getDb()` to an in-memory
// PGlite, and a seed that vanishes when the process exits is worse than no
// seed at all. The model choice is this flag's business and nothing else's.
const real = process.env.SEED_REAL === "1";

const db = await getDb();
const result = await seedSynthetic(db, real ? {} : { structured: syntheticScript() });

console.log(
  `seeded ${result.created} founder(s), ${result.existing} already present` +
    (real ? " — real engine" : " — scripted model, no cost"),
);
process.exit(0);
