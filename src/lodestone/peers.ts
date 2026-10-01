/** Classmates whose published cards share blocks with this one.
 *
 *  Nothing is blended: each facet the two cards both carry is compared as a
 *  mean-of-max cosine over its rows, and the card's score is the weighted
 *  mean of those. The explanation is the blocks whose rows produced a close
 *  pair, so "why this person" is a list of block names, not a number alone.
 *  Contact details are never here — an introduction is the consent
 *  proposal's job. */
import type { Db } from "@/db/client";
import { blockLabel, cohortCards, type CohortCard } from "./cards";
import { CLOSE } from "./geometry";
import { FAMILY_WEIGHTS, familyOf, ideaVectors, setSim, type IdeaVector } from "./vectors";

export interface SharedBlock {
  /** The block on this card, and the block on theirs. */
  mine: string;
  theirs: string;
  similarity: number;
}

export interface PeerHit {
  ideaId: string;
  title: string;
  line: string;
  owner: { id: string; name: string };
  publishedAt: Date | null;
  score: number;
  shared: SharedBlock[];
}

function byFacet(rows: IdeaVector[]): Map<string, IdeaVector[]> {
  const out = new Map<string, IdeaVector[]>();
  for (const r of rows) out.set(r.facet, [...(out.get(r.facet) ?? []), r]);
  return out;
}

/** Score one candidate against the query rows. Null when they share no facet. */
export function scorePeer(mine: IdeaVector[], theirs: IdeaVector[]): { score: number; shared: SharedBlock[] } | null {
  const a = byFacet(mine);
  const b = byFacet(theirs);
  let weighted = 0;
  let total = 0;
  const shared: SharedBlock[] = [];
  for (const [facet, rows] of a) {
    const other = b.get(facet);
    if (!other) continue;
    const sim = setSim(rows, other);
    if (!sim) continue;
    const w = FAMILY_WEIGHTS[familyOf(facet)] ?? 0.1;
    weighted += w * sim.value;
    total += w;
    if (sim.pair && sim.value >= CLOSE) {
      shared.push({ mine: blockLabel(sim.pair[0].block), theirs: blockLabel(sim.pair[1].block), similarity: sim.value });
    }
  }
  if (total === 0) return null;
  shared.sort((x, y) => y.similarity - x.similarity);
  const seen = new Set<string>();
  return {
    score: weighted / total,
    shared: shared.filter((s) => (seen.has(s.mine) ? false : (seen.add(s.mine), true))),
  };
}

/** Cohort cards by other members, scored against this card, best first.
 *  `candidates` narrows the pool, for the digest's "new since" list. */
export async function peersFor(db: Db, ideaId: string, k = 5, candidates?: CohortCard[]): Promise<PeerHit[]> {
  const pool = (candidates ?? (await cohortCards(db))).filter((c) => c.card.ideaId !== ideaId);
  const vectors = await ideaVectors(db, [ideaId, ...pool.map((c) => c.card.ideaId)]);
  const mine = vectors.get(ideaId) ?? [];
  if (mine.length === 0) return [];
  const hits: PeerHit[] = [];
  for (const c of pool) {
    const theirs = vectors.get(c.card.ideaId) ?? [];
    const scored = scorePeer(mine, theirs);
    if (!scored) continue;
    hits.push({
      ideaId: c.card.ideaId,
      title: c.card.title,
      line: c.card.line,
      owner: c.owner,
      publishedAt: c.card.publishedAt,
      score: scored.score,
      shared: scored.shared,
    });
  }
  return hits.sort((x, y) => y.score - x.score).slice(0, k);
}
