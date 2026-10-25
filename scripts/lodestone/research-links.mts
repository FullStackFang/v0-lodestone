/** `npm run lodestone:research-links -- research/<slug>`
 *
 * Hold a review's `links.json` to the `search.json` beside it
 * (`src/harness/research/links.ts`). A link to a stored hit stands; a link to
 * a live OpenAlex hit is ingested the way `lodestone:ingest --list` ingests
 * one, through the OpenAlex limiter and with the thirty-word floor, and
 * becomes its document id; anything else, or a work OpenAlex has no usable
 * abstract for, moves to `unresolved` with its reason. `links.json` is
 * rewritten in place, and the run ends by embedding what it stored.
 *
 * Honours `DATABASE_URL`; without it opens the local PGlite directory, which
 * `next dev` must not hold at the same time. */
import "../harness/env.mts";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDb } from "../../src/db/client";
import { embed } from "../../src/harness/embed";
import { fetchWork } from "../../src/harness/papers/openalex";
import { ingestWork, MIN_ABSTRACT_WORDS } from "../../src/harness/papers/ingest";
import { openalexLimiter } from "../../src/harness/papers/rate";
import { LinksFile, validateLinks } from "../../src/harness/research/links";
import type { PaperSearchHit } from "../../src/harness/research/search";
import { embedPaperAbstracts } from "../../src/lodestone/priorArt";

const folder = process.argv[2];
if (!folder || folder.startsWith("--")) {
  console.error("usage: lodestone:research-links <research/slug>");
  process.exit(1);
}
const read = (name: string) => JSON.parse(readFileSync(path.join(folder, name), "utf8"));
const hits = read("search.json") as PaperSearchHit[];
const parsed = LinksFile.safeParse(read("links.json"));
if (!parsed.success) {
  console.error(`links.json does not have the shape the skill asks for:\n${parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`);
  process.exit(1);
}

const db = await getDb();
const wait = openalexLimiter();
const provenance = { query_set: `research/${path.basename(path.resolve(folder))}` };
const out = await validateLinks(parsed.data, hits, async (w) =>
  ingestWork(db, w, {
    fetchWork: async (id) => {
      await wait();
      return fetchWork(id);
    },
    provenance,
    minWords: MIN_ABSTRACT_WORDS,
  }),
);
writeFileSync(path.join(folder, "links.json"), `${JSON.stringify(out, null, 2)}\n`);

const embedded = await embedPaperAbstracts(db, embed);
const resolved = out.items.reduce((n, item) => n + item.links.length, 0);
for (const u of out.unresolved) console.log(`unresolved ${u.reason}: ${u.link.id} — ${u.text.slice(0, 100)}`);
console.log(`# ${resolved} resolved, ${out.unresolved.length} unresolved; ${embedded} embedded`);
process.exit(0);
