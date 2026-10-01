/** The co-founder weights.
 *
 * `λ` (the mechanism-overlap penalty) and `μ` (sought-covered-by-commanded)
 * are **not** here: they live in `match_params` and are read at call time,
 * so a change to either is a row and not a deploy. What is here is the rest
 * of the sum, and it is written by a human who has read the grid that
 * `npm run bench -- pairs --fit` printed — never by the fit itself.
 *
 * Fitted 2026-09-02 against the twelve synthetic founders on voyage-3.5
 * vectors, `bench -- pairs --fit`: the grid chose λ = 0.3 with `specific` as
 * the headline rung, MRR 0.663 against 0.592 for every other cell.
 *
 * Read that result narrowly. Eleven cofounder pairs, and five of the six
 * cells scored identically — the winner is one cell moving, not a surface
 * with a peak in it. λ = 0.3 is also the largest value the grid tries, so the
 * best is sitting on the edge and the true optimum may be outside it.
 * Widening `LAMBDA_GRID` is a design decision (D5 fixes the 3×2), so the
 * boundary is recorded here rather than quietly stepped over.
 */
export interface Weights {
  /** Purpose at the abstract rung: the shape of the problem. */
  abs: number;
  /** Purpose at the specific rung: the problem itself. */
  spec: number;
  domain: number;
  commit: number;
  velocity: number;
}

/** Fitted 2026-09-02 — the `specific` headline from `HEADLINES`, the rest as
 *  D5 set them: the grid varies λ and the rung, and nothing else, so nothing
 *  else has been earned either. `bench -- pairs --fit` prints the grid; a
 *  human writes the winner here and notes the date and the run beside it. */
export const COFOUNDER: Weights = {
  abs: 0.5,
  spec: 1,
  domain: 0.25,
  commit: 0.25,
  velocity: 0.1,
};

/** The two cells the fit chooses between, per D5: which rung is the
 *  headline. Exported so the bench and this file cannot disagree about what
 *  was on offer. */
export const HEADLINES: Record<"abstract" | "specific", Pick<Weights, "abs" | "spec">> = {
  abstract: { abs: 1, spec: 0.5 },
  specific: { abs: 0.5, spec: 1 },
};

/** The λ values the fit grids over. */
export const LAMBDA_GRID = [0, 0.15, 0.3] as const;
