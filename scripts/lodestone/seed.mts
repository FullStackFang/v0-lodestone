/** `npm run lodestone:seed -- --me <email> [--private <n>]`
 *
 * Seed one synthetic cohort into the local on-disk ledger: eight members
 * with one Forge card each, five paper abstracts, every card and abstract
 * embedded through Voyage (the key in `.env.local`). The first `--private`
 * members keep their cards private (default 2), the rest publish to the
 * cohort. `--me` enrols that email as an operator member so the person who
 * signs in with it can import, publish, and open the map.
 *
 * Do not run while `next dev` holds `data/pglite` open. */
import "../harness/env.mts";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { COHORT, CORPUS, forgeDocument } from "../../evals/lodestone/cohort";
import { createPgliteDb } from "../../src/db/client";
import { document, documentChunk } from "../../src/db/schema";
import { putArtifactText } from "../../src/harness/canonical";
import { embed } from "../../src/harness/embed";
import { ensurePerson } from "../../src/harness/ledger";
import { importCard, setVisibility } from "../../src/lodestone/cards";
import { embedPaperAbstracts } from "../../src/lodestone/priorArt";
import { enrollTestMember } from "../../src/pilot/test-fixtures";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  return at === -1 ? null : args[at + 1] ?? null;
};
const me = flag("--me");
const keepPrivate = Number(flag("--private") ?? 2);
if (!process.env.VOYAGE_API_KEY?.trim()) {
  console.log("VOYAGE_API_KEY is not set: cards will be filed without vectors and nothing will match.");
}

const db = await createPgliteDb(path.resolve(process.cwd(), process.env.THESIS_DATA_DIR || "data/pglite"));

// The corpus: a document and its canonical abstract, then one embedded chunk.
let papersAdded = 0;
for (const p of CORPUS) {
  const existing = await db.select({ id: document.id }).from(document)
    .where(and(eq(document.source, "paper"), eq(document.title, p.title))).limit(1);
  if (existing[0]) continue;
  const [row] = await db.insert(document).values({ sessionId: null, source: "paper", title: p.title, text: p.abstract }).returning({ id: document.id });
  await putArtifactText(db, {
    artifactId: row.id,
    sourceFormat: "abstract",
    parser: "lodestone-seed-v1",
    text: p.abstract,
    provenance: { doi: null, openalex_id: null, field: p.field, venue: p.venue, year: p.year, authors: [], url: null },
  });
  papersAdded += 1;
}
const chunks = await embedPaperAbstracts(db, embed);
const unembedded = await db.select({ id: document.id }).from(document)
  .leftJoin(documentChunk, eq(documentChunk.documentId, document.id))
  .where(and(eq(document.source, "paper"), isNull(documentChunk.id)));
console.log(`corpus: ${papersAdded} papers added, ${chunks} abstracts embedded, ${unembedded.length} without a vector`);

// The cohort.
let at = 0;
for (const m of COHORT) {
  const personId = await ensurePerson(db, { name: m.name, email: m.email });
  await enrollTestMember(db, personId);
  const out = await importCard(db, { id: personId, email: m.email }, forgeDocument(m), embed);
  const visibility = at < keepPrivate ? "private" : "cohort";
  const card = await setVisibility(db, personId, m.ideaId, visibility);
  console.log(`${m.name.padEnd(18)} ${card.title.padEnd(26)} ${card.visibility.padEnd(8)} filed ${out.report.written} embedded ${out.embedded}`);
  at += 1;
}

if (me) {
  const personId = await ensurePerson(db, { name: me.split("@")[0], email: me });
  await enrollTestMember(db, personId, "operator");
  console.log(`${me} enrolled as an operator member: sign in with that email to import, publish and open the map.`);
} else {
  console.log("No --me given: sign-in users are not members until enrolled at /pilot/operator.");
}
process.exit(0);
