/** The cohort map a director sees: how many are working, how many have
 *  published, the regions the published cards form, how close the cards sit
 *  to each other, and which papers they touched. Counts and names, never a
 *  grade, and never the text of a card its author kept private. */
import { and, eq, inArray, isNotNull, max, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { artifactTexts, document } from "@/db/schema";
import { cardBlocks, cohortCards, cohortCounts, type CohortCard } from "./cards";
import { CLOSE, distanceProfile, kmeans, regionCount, regionLabels, type ProfileRow } from "./geometry";
import { CORPUS_SOURCES, priorArtForMany, type CorpusKind } from "./priorArt";
import { blended, ideaVectors } from "./vectors";

export interface MapRegion {
  label: string;
  cards: { ideaId: string; title: string; owner: string }[];
  /** Distinct papers any card in the region sits within `CLOSE` of. */
  papersTouched: number;
}

export interface CohortMap {
  counts: { members: number; working: number; published: number; placed: number; unplaced: number };
  regions: MapRegion[];
  profile: { rows: ProfileRow[]; pairs: number };
  papersTouched: number;
  close: number;
}

function cardText(c: CohortCard): string {
  const { blocks } = cardBlocks(c.card.doc);
  return [c.card.title, c.card.line, ...blocks.flatMap((b) => b.entries.map((e) => e.text))].join(" ");
}

export interface MapOptions {
  /** The neighbour threshold for "papers touched". Defaults to `CLOSE`. */
  close?: number;
}

export async function cohortMap(db: Db, options: MapOptions = {}): Promise<CohortMap> {
  const close = options.close ?? CLOSE;
  const [counts, cards] = await Promise.all([cohortCounts(db), cohortCards(db)]);
  const vectors = await ideaVectors(db, cards.map((c) => c.card.ideaId));
  const placed = cards
    .map((c) => ({ c, v: blended(vectors.get(c.card.ideaId) ?? []) }))
    .filter((x): x is { c: CohortCard; v: number[] } => x.v !== null);
  const points = placed.map((x) => x.v);

  const k = regionCount(points.length);
  const assignment = kmeans(points, k);
  const labels = regionLabels(placed.map((x) => cardText(x.c)), assignment, k);

  const touched = new Map<string, Set<string>>();
  const all = new Set<string>();
  const hitsByCard = await priorArtForMany(db, placed.map((x) => x.c.card.ideaId), 10, undefined, { vectors, cards: placed.map((x) => x.c.card) });
  for (const x of placed) {
    const hits = hitsByCard.get(x.c.card.ideaId) ?? [];
    const near = new Set(hits.filter((h) => h.score >= close).map((h) => h.documentId));
    touched.set(x.c.card.ideaId, near);
    for (const id of near) all.add(id);
  }

  const regions: MapRegion[] = [];
  for (let r = 0; r < k; r++) {
    const members = placed.filter((_, i) => assignment[i] === r);
    if (members.length === 0) continue;
    const papers = new Set<string>();
    for (const m of members) for (const id of touched.get(m.c.card.ideaId) ?? []) papers.add(id);
    regions.push({
      label: labels[r] || "unnamed",
      cards: members.map((m) => ({ ideaId: m.c.card.ideaId, title: m.c.card.title, owner: m.c.owner.name })),
      papersTouched: papers.size,
    });
  }
  regions.sort((a, b) => b.cards.length - a.cards.length || a.label.localeCompare(b.label));

  return {
    counts: { ...counts, placed: placed.length, unplaced: cards.length - placed.length },
    regions,
    profile: distanceProfile(points),
    papersTouched: all.size,
    close,
  };
}

export interface CorpusSummary {
  /** Documents per source, vector or not. */
  bySource: Record<CorpusKind, number>;
  /** Each ingest set with how many documents it brought, largest first. */
  querySets: { name: string; kind: CorpusKind; count: number }[];
  /** When the newest document arrived; null for an empty corpus. */
  newest: Date | null;
}

/** What the corpus holds, for the operator: counts per source, the query
 *  sets that filled it, and how fresh it is. */
export async function corpusSummary(db: Db): Promise<CorpusSummary> {
  const sources = [...CORPUS_SOURCES];
  const counts = await db
    .select({ source: document.source, count: sql<number>`count(*)::int`, newest: max(document.createdAt) })
    .from(document)
    .where(inArray(document.source, sources))
    .groupBy(document.source);
  const setName = sql<string>`${artifactTexts.provenance}->>'query_set'`;
  const sets = await db
    .select({ name: setName, kind: document.source, count: sql<number>`count(distinct ${document.id})::int` })
    .from(artifactTexts)
    .innerJoin(document, eq(document.id, artifactTexts.artifactId))
    .where(and(inArray(document.source, sources), isNotNull(setName)))
    .groupBy(setName, document.source);
  const bySource = { paper: 0, patent: 0 } as Record<CorpusKind, number>;
  let newest: Date | null = null;
  for (const c of counts) {
    bySource[c.source as CorpusKind] = c.count;
    const at = c.newest ? new Date(c.newest) : null;
    if (at && (!newest || at > newest)) newest = at;
  }
  return {
    bySource,
    querySets: sets
      .map((s) => ({ name: s.name, kind: s.kind as CorpusKind, count: s.count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    newest,
  };
}
