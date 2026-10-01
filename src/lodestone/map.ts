/** The cohort map a director sees: how many are working, how many have
 *  published, the regions the published cards form, how close the cards sit
 *  to each other, and which papers they touched. Counts and names, never a
 *  grade, and never the text of a card its author kept private. */
import type { Db } from "@/db/client";
import { cardBlocks, cohortCards, cohortCounts, type CohortCard } from "./cards";
import { CLOSE, distanceProfile, kmeans, regionCount, regionLabels, type ProfileRow } from "./geometry";
import { priorArtFor } from "./priorArt";
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
  const counts = await cohortCounts(db);
  const cards = await cohortCards(db);
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
  for (const x of placed) {
    const hits = await priorArtFor(db, x.c.card.ideaId, 10);
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
