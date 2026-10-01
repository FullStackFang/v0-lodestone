/** `npm run harness:forge -- <forge-idea.json> [--person-email <email>] [--ladder] [--embed voyage]`
 *
 * Projects a Forge export into the local ledger: on-disk PGlite under
 * `data/pglite` (or `THESIS_DATA_DIR`), never a server — `DATABASE_URL` is
 * ignored here on purpose, because the file is the interface and the ledger
 * for Forge ideas is local. No model call unless `--ladder`, and no
 * embedding request unless `--embed voyage`, which prints what it will send
 * first. `.env.local` may hold a Voyage key; holding one is not opting in. */
// Must come first: modules below read `process.env` when they load.
import "./env.mts";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createPgliteDb } from "../../src/db/client";
import { EMBEDDING_MODEL, embed } from "../../src/harness/embed";
import { forgeCli } from "../../src/harness/founder/forge";

if (process.env.DATABASE_URL) {
  console.log("DATABASE_URL is set and ignored: Forge ideas go to the local on-disk ledger.");
}
const db = await createPgliteDb(path.resolve(process.cwd(), process.env.THESIS_DATA_DIR || "data/pglite"));

const code = await forgeCli(db, process.argv.slice(2), {
  readFile: (file) => readFileSync(file, "utf8"),
  log: (line) => console.log(line),
  embed,
  embeddingModel: EMBEDDING_MODEL,
});
process.exit(code);
