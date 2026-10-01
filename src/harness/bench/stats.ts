/** A mean over ten abstracts is not a number; it is a number with a width.
 *  Fold 0 of fifty abstracts is ten texts and a token F1 at n = 10 swings
 *  ±0.1, so every bench headline that is a mean prints its sample size and
 *  a percentile bootstrap interval beside it. Seeded, so a re-run of the
 *  same numbers prints the same interval. */

export interface Interval {
  mean: number;
  /** Percentile 95% interval, [lower, upper]. */
  ci: [number, number];
  n: number;
}

/** mulberry32 — small, seeded, and good enough for resampling. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mean = (values: number[]) => values.reduce((n, v) => n + v, 0) / values.length;

export function bootstrapCI(
  values: number[],
  options: { iterations?: number; seed?: number } = {},
): Interval {
  const n = values.length;
  if (n === 0) return { mean: 0, ci: [0, 0], n: 0 };
  if (n === 1) return { mean: values[0], ci: [values[0], values[0]], n: 1 };

  const iterations = options.iterations ?? 1000;
  const next = rng(options.seed ?? 1);
  const means: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let total = 0;
    for (let j = 0; j < n; j++) total += values[Math.floor(next() * n)];
    means.push(total / n);
  }
  means.sort((a, b) => a - b);
  const at = (p: number) => means[Math.min(means.length - 1, Math.max(0, Math.floor(p * means.length)))];
  return { mean: mean(values), ci: [at(0.025), at(0.975)], n };
}
