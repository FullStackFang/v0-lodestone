/** `npm run lodestone:eval -- [--label <text>] [--no-search]`
 *
 * Score the current prior-art ranking against the fixed eval set in
 * `evals/lodestone/eval-set/`. In its own PGlite (`data/pglite-eval`, never
 * `DATABASE_URL`) it ingests every marked paper and every distractor through
 * the keyed OpenAlex lookup, embeds them, files each card through
 * `importCard`, ranks each with `priorArtFor(db, ideaId, 10)` and prints
 * precision at 5, recall at 10, mean reciprocal rank and mean distinct fields
 * in the top ten. The per-card table goes to
 * `evals/lodestone/eval-set/results/<date>-<label>.md`.
 *
 * Needs `VOYAGE_API_KEY` (a bag-of-words number would be about the wrong
 * system) and `OPENALEX_API_KEY` (a thousand single-work fetches do not fit
 * the keyless budget); without either it writes nothing. Works already held
 * cost no request, so after the first run the embedder is the only network
 * call. `--no-search` imports cards with card search off; card search does
 * not exist yet, so today it is recorded and changes nothing.
 *
 * On a rate limit or a network failure the ingest stops and the run exits 2;
 * running it again resumes. */
import "../harness/env.mts";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { inArray } from "drizzle-orm";

const args = process.argv.slice(2);
const flag = (name: string): string | null => {
  const at = args.indexOf(name);
  return at === -1 ? null : args[at + 1] ?? null;
};
const label = (flag("--label") ?? "run").replace(/[^a-z0-9._-]+/gi, "-");
const noSearch = args.includes("--no-search");

const missing = ["VOYAGE_API_KEY", "OPENALEX_API_KEY"].filter((k) => !process.env[k]?.trim());
if (missing.length) {
  console.error(`${missing.join(" and ")} not set: the eval needs the production embedder and the keyed OpenAlex lookup. Nothing written.`);
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run with NODE_ENV=production: the eval opens its own PGlite only.");
  process.exit(1);
}
// Set before the client module is loaded: the eval never touches another database.
delete process.env.DATABASE_URL;
process.env.THESIS_DATA_DIR = "data/pglite-eval";

const { EVAL_CARDS } = await import("../../evals/lodestone/eval-set/cards");
const { MARKS } = await import("../../evals/lodestone/eval-set/marks");
const { idKey, meanScores, scoreCard } = await import("../../evals/lodestone/eval-set/metrics");
const { getDb } = await import("../../src/db/client");
const { artifactTexts } = await import("../../src/db/schema");
const { embed, EMBEDDING_MODEL } = await import("../../src/harness/embed");
const { ensurePerson } = await import("../../src/harness/ledger");
const { fetchWork } = await import("../../src/harness/papers/openalex");
const { ingestWork, MIN_ABSTRACT_WORDS, parseList } = await import("../../src/harness/papers/ingest");
const { openalexLimiter } = await import("../../src/harness/papers/rate");
const { BLOCKS, importCard } = await import("../../src/lodestone/cards");
const { corpusSize, embedPaperAbstracts, priorArtFor } = await import("../../src/lodestone/priorArt");
const { enrollTestMember } = await import("../../src/pilot/test-fixtures");

const SET_DIR = path.join(process.cwd(), "evals/lodestone/eval-set");
const distractorIds = parseList(readFileSync(path.join(SET_DIR, "distractors.txt"), "utf8"));
const distractors = new Set(distractorIds.map(idKey));
const scored = EVAL_CARDS.filter((c) => (MARKS[c.slug] ?? []).length > 0);
const unmarked = EVAL_CARDS.filter((c) => !scored.includes(c)).map((c) => c.slug);
if (scored.length === 0) {
  console.error("No card has marks yet (evals/lodestone/eval-set/marks.ts): nothing to score. Nothing written.");
  process.exit(1);
}
if (unmarked.length) console.log(`# ${unmarked.length} cards without marks are not scored: ${unmarked.join(", ")}`);

const db = await getDb();

// The corpus: marks first, so a stop partway still holds what is scored against.
const wait = openalexLimiter();
const fetchThrottled = async (id: string) => {
  await wait();
  return fetchWork(id);
};
const markIds = [...new Set(scored.flatMap((c) => MARKS[c.slug].filter((m) => m.source === "openalex").map((m) => m.id)))];
const tally = { new: 0, existing: 0, absent: [] as string[] };
const lists: [string, string[]][] = [["eval-mark", markIds], ["eval-distractor", distractorIds]];
for (const [set, ids] of lists) {
  for (const id of ids) {
    try {
      const result = await ingestWork(db, id, { fetchWork: fetchThrottled, provenance: { query_set: set }, minWords: MIN_ABSTRACT_WORDS });
      if (result.status === "ok") tally[result.created ? "new" : "existing"] += 1;
      else tally.absent.push(`${id} ${result.status}${set === "eval-mark" ? " (MARK)" : ""}`);
    } catch (error) {
      console.error(`# stopped at ${id}: ${error instanceof Error ? error.message : String(error)}`);
      await embedPaperAbstracts(db, embed);
      console.error("# resume by running the same command again");
      process.exit(2);
    }
  }
}
const embedded = await embedPaperAbstracts(db, embed);
console.log(`# corpus: ${tally.new} new, ${tally.existing} held, ${tally.absent.length} not in the corpus; ${embedded} embedded, ${await corpusSize(db)} with a vector`);
for (const line of tally.absent) console.log(`#   ${line}`);

// The cards, search off: with `--no-search` or not, nothing searches yet.
for (const card of scored) {
  const personId = await ensurePerson(db, { name: card.name, email: card.email });
  await enrollTestMember(db, personId);
  await importCard(db, { id: personId, email: card.email }, card.doc, embed);
}

// Ranking and scoring.
const keyOfLabel = new Map<string, string>(BLOCKS.map(([key, text]) => [text, key]));
const rows: { slug: string; field: string; score: ReturnType<typeof scoreCard>; hits: Awaited<ReturnType<typeof priorArtFor>>; misses: string[] }[] = [];
for (const card of scored) {
  const marks = MARKS[card.slug];
  const hits = await priorArtFor(db, card.ideaId, 10);
  const provenance = hits.length
    ? await db.select({ id: artifactTexts.artifactId, p: artifactTexts.provenance }).from(artifactTexts).where(inArray(artifactTexts.artifactId, hits.map((h) => h.documentId)))
    : [];
  const keysOf = (documentId: string) =>
    provenance
      .filter((r) => r.id === documentId)
      .flatMap(({ p }) => [p?.doi, p?.openalex_id].filter((k): k is string => typeof k === "string"));
  const scoredHits = hits.map((h) => ({ keys: keysOf(h.documentId), blocks: h.blocks.map((b) => keyOfLabel.get(b) ?? b), field: h.field }));
  const score = scoreCard(scoredHits, marks, distractors);
  const found = new Set(scoredHits.flatMap((h) => h.keys.map(idKey)));
  rows.push({ slug: card.slug, field: card.field, score, hits, misses: marks.filter((m) => !found.has(idKey(m.id))).map((m) => `${m.id} (${m.block})`) });
}
const run = meanScores(rows.map((r) => r.score));
const wrongBlock = rows.reduce((a, r) => a + r.score.wrongBlock, 0);
const fixed = (n: number) => n.toFixed(3);
const summary = [
  `cards scored     ${run.cards} of ${EVAL_CARDS.length}`,
  `precision at 5   ${fixed(run.precisionAt5)}`,
  `recall at 10     ${fixed(run.recallAt10)}`,
  `MRR              ${fixed(run.mrr)}`,
  `fields in top 10 ${run.fields.toFixed(2)}`,
  `wrong-block hits ${wrongBlock}`,
];
console.log(summary.join("\n"));

// The results file.
const date = new Date().toISOString().slice(0, 10);
const cell = (s: string) => s.replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
const out = [
  `# Eval run ${date} — ${label}`,
  "",
  `Embedder \`${EMBEDDING_MODEL}\`; corpus ${await corpusSize(db)} documents with a vector (${distractorIds.length} distractors listed); card search ${noSearch ? "off (`--no-search`)" : "off (card search not built)"}.`,
  ...(unmarked.length ? ["", `Not scored, no marks yet: ${unmarked.join(", ")}.`] : []),
  ...(tally.absent.length ? ["", `Listed but not in the corpus: ${tally.absent.join("; ")}.`] : []),
  "",
  "```",
  ...summary,
  "```",
  "",
  "| card | field | P@5 | R@10 | RR | fields | wrong-block |",
  "|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| fang-${r.slug} | ${r.field} | ${fixed(r.score.precisionAt5)} | ${fixed(r.score.recallAt10)} | ${fixed(r.score.reciprocalRank)} | ${r.score.fields} | ${r.score.wrongBlock} |`),
  ...rows.flatMap((r) => [
    "",
    `## fang-${r.slug}`,
    "",
    "| # | status | score | blocks | field | title |",
    "|---|---|---|---|---|---|",
    ...r.hits.map((h, i) => `| ${i + 1} | ${r.score.statuses[i]} | ${h.score.toFixed(3)} | ${cell(h.blocks.join(", "))} | ${cell(h.field ?? "—")} | ${cell(h.title).slice(0, 90)} |`),
    ...(r.misses.length ? ["", `Marked, not in the top ten: ${r.misses.join("; ")}.`] : []),
  ]),
  "",
];
const resultsDir = path.join(SET_DIR, "results");
mkdirSync(resultsDir, { recursive: true });
const file = path.join(resultsDir, `${date}-${label}.md`);
writeFileSync(file, out.join("\n"));
console.log(`# wrote ${path.relative(process.cwd(), file)}`);
process.exit(0);
