/** The eval's four numbers, from one card's ranked hits and its marks.
 *
 *  A hit counts toward precision, recall and reciprocal rank when its
 *  document is marked, whatever block the ranking names: finding the paper is
 *  what those numbers measure. Whether the ranking named the marked block is
 *  the hit's status — `relevant` when the mark's block is among the hit's
 *  blocks, `wrong-block` when it is not — and is counted on its own. */

export type MarkStatus = "relevant" | "wrong-block" | "distractor" | "unmarked";

/** A ranked hit, reduced to what scoring reads. `keys` are every identifier
 *  the document carries (lower-cased DOI, OpenAlex `W…` id). */
export interface ScoredHit {
  keys: string[];
  blocks: string[];
  field: string | null;
}

export interface Mark {
  id: string;
  block: string;
}

/** A DOI or OpenAlex id in the one form marks and hits are compared in. */
export function idKey(id: string): string {
  const s = id.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:/i, "").replace(/^https?:\/\/openalex\.org\//i, "");
  return /^w\d+$/i.test(s) ? s.toUpperCase() : s.toLowerCase();
}

export function statusOf(hit: ScoredHit, marks: Mark[], distractors: Set<string>): MarkStatus {
  const keys = hit.keys.map(idKey);
  const mark = marks.find((m) => keys.includes(idKey(m.id)));
  if (mark) return hit.blocks.includes(mark.block) ? "relevant" : "wrong-block";
  return keys.some((k) => distractors.has(k)) ? "distractor" : "unmarked";
}

export interface CardScore {
  precisionAt5: number;
  recallAt10: number;
  reciprocalRank: number;
  fields: number;
  wrongBlock: number;
  statuses: MarkStatus[];
}

export function scoreCard(hits: ScoredHit[], marks: Mark[], distractors: Set<string>): CardScore {
  const top = hits.slice(0, 10);
  const statuses = top.map((h) => statusOf(h, marks, distractors));
  const found = statuses.map((s) => s === "relevant" || s === "wrong-block");
  const first = found.indexOf(true);
  return {
    precisionAt5: found.slice(0, 5).filter(Boolean).length / 5,
    recallAt10: marks.length ? found.filter(Boolean).length / marks.length : 0,
    reciprocalRank: first === -1 ? 0 : 1 / (first + 1),
    fields: new Set(top.map((h) => h.field).filter((f): f is string => !!f)).size,
    wrongBlock: statuses.filter((s) => s === "wrong-block").length,
    statuses,
  };
}

export interface RunScore {
  cards: number;
  precisionAt5: number;
  recallAt10: number;
  mrr: number;
  fields: number;
}

export function meanScores(scores: CardScore[]): RunScore {
  const mean = (f: (s: CardScore) => number) => (scores.length ? scores.reduce((a, s) => a + f(s), 0) / scores.length : 0);
  return {
    cards: scores.length,
    precisionAt5: mean((s) => s.precisionAt5),
    recallAt10: mean((s) => s.recallAt10),
    mrr: mean((s) => s.reciprocalRank),
    fields: mean((s) => s.fields),
  };
}
