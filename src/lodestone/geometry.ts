/** The map's arithmetic, with no database in it: pairwise distances binned
 *  into a profile, k-means regions with a deterministic start, and region
 *  labels lifted from the cards' own words by TF-IDF. Small n throughout —
 *  a cohort is tens of cards, not thousands. */
import { cosine, unit } from "./vectors";

/** The bands the Idea Atlas already draws. `close` is the arbitrage PoC's
 *  threshold; a pair at or above it is a neighbour. */
export const CLOSE = 0.75;
export const PROFILE_BANDS = [0.85, 0.8, 0.75, 0.7, 0.65, 0.6] as const;

export interface ProfileRow {
  /** The band's lower edge, or null for everything below the last band. */
  from: number | null;
  count: number;
  close: boolean;
}

/** Every unordered pair's cosine, binned from the top down. */
export function distanceProfile(points: number[][]): { rows: ProfileRow[]; pairs: number } {
  const counts = new Array<number>(PROFILE_BANDS.length + 1).fill(0);
  let pairs = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const c = cosine(points[i], points[j]);
      pairs += 1;
      let at = PROFILE_BANDS.findIndex((edge) => c >= edge);
      if (at === -1) at = PROFILE_BANDS.length;
      counts[at] += 1;
    }
  }
  const rows: ProfileRow[] = PROFILE_BANDS.map((from, i) => ({ from, count: counts[i], close: from >= CLOSE }));
  rows.push({ from: null, count: counts[PROFILE_BANDS.length], close: false });
  return { rows, pairs };
}

/** How many regions n cards make: one for a handful, never more than six. */
export function regionCount(n: number): number {
  if (n < 3) return Math.max(n, 0) === 0 ? 0 : 1;
  return Math.min(6, Math.max(2, Math.round(Math.sqrt(n / 2))));
}

/** k-means on unit vectors with farthest-first seeding from the first
 *  point, so the same cards always make the same regions. */
export function kmeans(points: number[][], k: number, iterations = 25): number[] {
  const n = points.length;
  if (n === 0 || k <= 0) return [];
  if (k >= n) return points.map((_, i) => i);
  const centers: number[][] = [points[0]];
  while (centers.length < k) {
    let far = -1;
    let farDist = -Infinity;
    for (let i = 0; i < n; i++) {
      let nearest = -Infinity;
      for (const c of centers) nearest = Math.max(nearest, cosine(points[i], c));
      const d = 1 - nearest;
      if (d > farDist) {
        farDist = d;
        far = i;
      }
    }
    centers.push(points[far]);
  }
  let assignment = new Array<number>(n).fill(0);
  for (let round = 0; round < iterations; round++) {
    const next = points.map((p) => {
      let best = 0;
      let bestSim = -Infinity;
      centers.forEach((c, at) => {
        const s = cosine(p, c);
        if (s > bestSim) {
          bestSim = s;
          best = at;
        }
      });
      return best;
    });
    const same = next.every((v, i) => v === assignment[i]);
    assignment = next;
    for (let c = 0; c < k; c++) {
      const members = points.filter((_, i) => assignment[i] === c);
      if (members.length === 0) continue;
      const sum = new Array<number>(points[0].length).fill(0);
      for (const m of members) for (let i = 0; i < sum.length; i++) sum[i] += m[i];
      centers[c] = unit(sum);
    }
    if (same && round > 0) break;
  }
  return assignment;
}

const STOP = new Set(
  "a an the and or of to for in on at by with from as is are be was were it its this that these those we our you your they their i my not no but so if then than into over under out up down about across per via each every any all one two new more most less own same other such only also can could would should will may might do does did done make made get got use used using".split(
    " ",
  ),
);

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter((t) => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t));
}

/** Three words per region that are common inside it and rare outside it. */
export function regionLabels(docs: string[], assignment: number[], k: number, words = 3): string[] {
  const docTokens = docs.map(tokens);
  const df = new Map<string, number>();
  for (const ts of docTokens) for (const t of new Set(ts)) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length;
  const labels: string[] = [];
  for (let c = 0; c < k; c++) {
    const tf = new Map<string, number>();
    let size = 0;
    docTokens.forEach((ts, i) => {
      if (assignment[i] !== c) return;
      size += 1;
      for (const t of ts) tf.set(t, (tf.get(t) ?? 0) + 1);
    });
    if (size === 0) {
      labels.push("");
      continue;
    }
    const scored = [...tf.entries()].map(([t, f]) => [t, (f / size) * Math.log((n + 1) / ((df.get(t) ?? 0) + 0.5))] as const);
    scored.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    labels.push(scored.slice(0, words).map(([t]) => t).join(" · "));
  }
  return labels;
}
