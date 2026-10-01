/** `npm run harness:ingest -- <doi|W-id>… | --list <file>`.
 *
 * One line per identifier, whatever happens to it. The exit code is
 * non-zero only when every identifier failed: a batch of fifty with one
 * withheld abstract has still done its work. */
// Must come first: modules below read `process.env` when they load.
import "./env.mts";
import { readFileSync } from "node:fs";
import { getDb } from "../../src/db/client";
import { ingestLine, ingestWork, parseList } from "../../src/harness/papers/ingest";

const argv = process.argv.slice(2);

const identifiers: string[] = [];
for (let at = 0; at < argv.length; at++) {
  if (argv[at] === "--list") {
    const file = argv[++at];
    if (!file) {
      console.error("--list needs a file");
      process.exit(1);
    }
    identifiers.push(...parseList(readFileSync(file, "utf8")));
    continue;
  }
  identifiers.push(argv[at]);
}

if (identifiers.length === 0) {
  console.error("usage: npm run harness:ingest -- <doi|W-id>… | --list <file>");
  process.exit(1);
}

const db = await getDb();
let ok = 0;

for (const identifier of identifiers) {
  try {
    const result = await ingestWork(db, identifier);
    console.log(ingestLine(result));
    if (result.status === "ok") ok += 1;
  } catch (err) {
    console.log(`${identifier} error ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.error(`${ok} of ${identifiers.length} ingested`);
// PGlite holds the event loop open on its data directory.
process.exit(ok === 0 ? 1 : 0);
