/** Card search: on import, each block with entries is searched in OpenAlex
 *  (semantic, then keyword) and Semantic Scholar, and what comes back is
 *  ingested and embedded, so a card ranks against literature fetched for it
 *  rather than only against what an operator ingested by hand.
 *
 *  `card_search` remembers each block's last run by a hash of its entry
 *  texts: a re-import searches only the blocks that changed, plus any left
 *  `running` past the stale window. A source that fails is recorded in its
 *  block's row and the search carries on; nothing here throws to the caller.
 *
 *  A searched-in document's provenance is the work's own, plus
 *  `query_set: "card-search"` and a Semantic Scholar TLDR. Nothing of the
 *  card is stored with it. The card's text does leave the server, as the
 *  search strings. */
import { createHash } from "node:crypto";
import { and, eq, notInArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cardSearch, forgeCard, type CardSearchSources } from "@/db/lodestone-schema";
import { parseForgeIdea } from "@/harness/founder/forge";
import { ingestWork, MIN_ABSTRACT_WORDS, type IngestResult } from "@/harness/papers/ingest";
import { fetchWork as fetchOpenAlexWork, type OpenAlexWork } from "@/harness/papers/openalex";
import { openalexLimiter } from "@/harness/papers/rate";
import { searchS2 as searchSemanticScholar } from "@/harness/papers/s2";
import { searchWorks as searchOpenAlex } from "@/harness/papers/search";
import { cardBlocks, type CardBlock, type Embedder } from "./cards";
import { CARD_SEARCH_QUERY_SET, embedPaperAbstracts } from "./priorArt";

export { CARD_SEARCH_QUERY_SET };
/** The only provenance keys a searched-in document may carry. */
export const PROVENANCE_KEYS = ["doi", "openalex_id", "field", "venue", "year", "authors", "url", "query_set", "thin", "tldr"];
/** A block `running` this long has died; the next import searches it again. */
export const STALE_MS = 5 * 60 * 1000;
/** OpenAlex truncates a semantic query here. */
const SEMANTIC_MAX = 2000;
const KEYWORDS = 8;
const KEYWORD_LIMIT = 25;

export type Purpose = { l1: string; l2: string } | null;

const STOPWORDS = new Set(
  ("a an and are as at be been but by can do does each every for from has have how in into is it its more most no not of on one or " +
    "our so such than that the their them then there these they this those to too us was we were what when where which while who whom " +
    "why will with would you your via per who's it's").split(" "),
);

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g) ?? []).filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** The two query strings for one block. Semantic: the purpose's `l2` (when
 *  the card has one), the block label, the entries; trimmed to OpenAlex's
 *  2,000 characters by cutting the entries, never the purpose. Keyword: the
 *  block's content words ranked by how often they occur across the whole
 *  card, at most eight. */
export function queryFor(block: CardBlock, purpose: Purpose, card: CardBlock[] = [block]): { semantic: string; keyword: string } {
  const head = `${purpose?.l2 ? `${purpose.l2.trim().replace(/\.$/, "")}. ` : ""}${block.label}: `;
  const semantic = (head + block.entries.map((e) => e.text.trim()).join("; ")).slice(0, Math.max(SEMANTIC_MAX, head.length));

  const tf = new Map<string, number>();
  for (const b of card) for (const e of b.entries) for (const w of words(e.text)) tf.set(w, (tf.get(w) ?? 0) + 1);
  const own = [...new Set(block.entries.flatMap((e) => words(e.text)))];
  const keyword = own
    .map((w, at) => ({ w, at, n: tf.get(w) ?? 1 }))
    .sort((a, b) => b.n - a.n || a.at - b.at)
    .slice(0, KEYWORDS)
    .map((x) => x.w)
    .join(" ");
  return { semantic, keyword };
}

/** sha256 of each block's entry texts in canvas order, keyed by block key;
 *  only blocks with entries. */
export function blockHashes(doc: Record<string, unknown>): Map<string, string> {
  const out = new Map<string, string>();
  for (const b of cardBlocks(doc).blocks) {
    if (b.entries.length === 0) continue;
    out.set(b.key, createHash("sha256").update(b.entries.map((e) => e.text).join("\n"), "utf8").digest("hex"));
  }
  return out;
}

/** The blocks to search now: those whose text changed since their last run
 *  and those stuck `running` past the stale window. Rows for blocks that no
 *  longer have entries are deleted. */
export async function plannedBlocks(db: Db, ideaId: string, doc: Record<string, unknown>, now = new Date()): Promise<CardBlock[]> {
  const hashes = blockHashes(doc);
  await db
    .delete(cardSearch)
    .where(and(eq(cardSearch.ideaId, ideaId), hashes.size ? notInArray(cardSearch.block, [...hashes.keys()]) : undefined));
  const rows = new Map((await db.select().from(cardSearch).where(eq(cardSearch.ideaId, ideaId))).map((r) => [r.block, r]));
  return cardBlocks(doc).blocks.filter((b) => {
    const hash = hashes.get(b.key);
    if (!hash) return false;
    const row = rows.get(b.key);
    if (!row || row.textHash !== hash) return true;
    return row.state === "running" && now.getTime() - row.startedAt.getTime() > STALE_MS;
  });
}

export interface SearchDeps {
  searchWorks: typeof searchOpenAlex;
  searchS2: typeof searchSemanticScholar;
  /** Resolves a Semantic Scholar DOI to its OpenAlex work. */
  fetchWork: (identifier: string) => Promise<OpenAlexWork | null>;
  embed: Embedder;
  now: () => Date;
}

/** The real sources; the DOI lookup paced at the OpenAlex ceiling. */
export function defaultSearchDeps(embed: Embedder): SearchDeps {
  const wait = openalexLimiter();
  return {
    searchWorks: searchOpenAlex,
    searchS2: searchSemanticScholar,
    fetchWork: async (id) => {
      await wait();
      return fetchOpenAlexWork(id);
    },
    embed,
    now: () => new Date(),
  };
}

type Tally = CardSearchSources[string];

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Search the card's planned blocks, ingest what comes back, embed it, and
 *  record each block's run. Never throws: a failure lands in the row. */
export async function searchCard(db: Db, ideaId: string, deps: SearchDeps): Promise<void> {
  const [card] = await db.select({ doc: forgeCard.doc }).from(forgeCard).where(eq(forgeCard.ideaId, ideaId)).limit(1);
  if (!card) return;
  const purpose = parseForgeIdea(card.doc).purpose;
  const hashes = blockHashes(card.doc);
  const all = cardBlocks(card.doc).blocks;
  const blocks = await plannedBlocks(db, ideaId, card.doc, deps.now());

  for (const block of blocks) {
    const textHash = hashes.get(block.key)!;
    const startedAt = deps.now();
    await db
      .insert(cardSearch)
      .values({ ideaId, block: block.key, textHash, state: "running", startedAt, finishedAt: null, sources: {}, found: 0 })
      .onConflictDoUpdate({
        target: [cardSearch.ideaId, cardSearch.block],
        set: { textHash, state: "running", startedAt, finishedAt: null, sources: {}, found: 0 },
      });

    const query = queryFor(block, purpose, all);
    const sources: CardSearchSources = {};
    const seen = new Set<string>();

    const count = (tally: Tally, result: IngestResult) => {
      if (result.status !== "ok") return;
      if (result.created && !result.sharedWith) tally.new += 1;
      else tally.existing += 1;
    };

    const openalex = async (name: string, semantic: boolean, text: string) => {
      const tally: Tally = { new: 0, existing: 0 };
      sources[name] = tally;
      try {
        const result = await deps.searchWorks({ query: text, semantic, limit: semantic ? undefined : KEYWORD_LIMIT }, async (work) => {
          const id = work.id ?? "";
          if (!id) return;
          if (seen.has(id)) {
            tally.existing += 1;
            return;
          }
          seen.add(id);
          count(tally, await ingestWork(db, id, { fetchWork: async () => work, provenance: { query_set: CARD_SEARCH_QUERY_SET }, minWords: MIN_ABSTRACT_WORDS }));
        });
        if (result.stopped) tally.error = result.reason ?? "stopped";
      } catch (error) {
        tally.error = message(error);
      }
    };

    await openalex("openalex_semantic", true, query.semantic);
    await openalex("openalex_keyword", false, query.keyword);

    const s2: Tally = { new: 0, existing: 0, skipped_no_doi: 0 };
    sources.s2 = s2;
    try {
      const result = await deps.searchS2({ query: query.keyword });
      s2.skipped_no_doi = result.skippedNoDoi;
      if (result.error) s2.error = result.error;
      for (const hit of result.hits) {
        const provenance: Record<string, unknown> = { query_set: CARD_SEARCH_QUERY_SET };
        if (hit.tldr) provenance.tldr = hit.tldr;
        count(s2, await ingestWork(db, hit.doi, { fetchWork: deps.fetchWork, provenance, minWords: MIN_ABSTRACT_WORDS }));
      }
    } catch (error) {
      s2.error = message(error);
    }

    const found = Object.values(sources).reduce((n, t) => n + t.new, 0);
    await db
      .update(cardSearch)
      .set({ state: "done", finishedAt: deps.now(), sources, found })
      .where(and(eq(cardSearch.ideaId, ideaId), eq(cardSearch.block, block.key)));
  }

  if (blocks.length > 0) {
    try {
      await embedPaperAbstracts(db, deps.embed);
    } catch {
      // Left unembedded, a document is picked up by the next embed pass.
    }
  }
}

export interface SearchState {
  state: "running" | "stale" | "done";
  finishedAt: Date | null;
  /** Per source, summed over the card's blocks; the last error seen. */
  sources: CardSearchSources;
  /** Documents the card's searches added to the corpus. */
  found: number;
  /** Whether the card carried a purpose to abstract its queries. */
  abstracted: boolean;
}

/** The card's search as a client sees it: the fold of its block rows. A card
 *  with no rows is `done` with nothing found, so a client never polls a card
 *  imported before search existed. */
export async function searchState(db: Db, ideaId: string, doc: Record<string, unknown>, now = new Date()): Promise<SearchState> {
  const rows = await db.select().from(cardSearch).where(eq(cardSearch.ideaId, ideaId));
  const abstracted = parseForgeIdea(doc).purpose !== null;
  const running = rows.filter((r) => r.state === "running");
  const stale = running.some((r) => now.getTime() - r.startedAt.getTime() > STALE_MS);
  const sources: CardSearchSources = {};
  for (const r of rows) {
    for (const [name, t] of Object.entries(r.sources)) {
      const sum = (sources[name] ??= { new: 0, existing: 0 });
      sum.new += t.new;
      sum.existing += t.existing;
      if (t.skipped_no_doi !== undefined) sum.skipped_no_doi = (sum.skipped_no_doi ?? 0) + t.skipped_no_doi;
      if (t.error) sum.error = t.error;
    }
  }
  const finished = rows.map((r) => r.finishedAt).filter((d): d is Date => d !== null);
  return {
    state: stale ? "stale" : running.length ? "running" : "done",
    finishedAt: running.length || finished.length === 0 ? null : new Date(Math.max(...finished.map((d) => d.getTime()))),
    sources,
    found: rows.reduce((n, r) => n + r.found, 0),
    abstracted,
  };
}
