/** The scorer, and the tokenization everything else in the harness agrees
 *  to use — the bench, and reconciliation's overlap.
 *
 * Two numbers per class, never one. Token F1 alone is TOCHI's metric and it
 * rewards a run that marks the whole abstract as one purpose: recall 1.0,
 * precision high, and a reader who learns nothing about where a purpose
 * starts. Exact-span F1 alone is too brittle to move. The headline is their
 * mean over `purpose` and `mechanism`, and all four F1s stay as columns so
 * a move in either is visible.
 *
 * Offsets are UTF-16 code units, as everywhere else. */
import { bootstrapCI, type Interval } from "./stats";

export interface Token {
  start: number;
  end: number;
  text: string;
}

/** Whitespace-split, with the offsets each piece occupies in the text. */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const pattern = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    out.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
  }
  return out;
}

/** The two classes the bench scores. A `mechanism.*` subtype is
 *  `mechanism`: a paper's method and a founder's product are one axis. */
export const CLASSES = ["purpose", "mechanism"] as const;
export type Klass = (typeof CLASSES)[number];

/** The class a facet name scores in, or null for one the bench ignores. */
export function classOf(facet: string | null | undefined): Klass | null {
  if (!facet) return null;
  if (facet === "purpose") return "purpose";
  if (facet.startsWith("mechanism")) return "mechanism";
  return null;
}

export interface LabelledSpan {
  start: number;
  end: number;
  /** A facet name (`purpose`, `mechanism.revenue`) or a class outright. */
  facet: string;
}

export type TokenLabels = Record<Klass, boolean[]>;

/**
 * Per-token class membership.
 *
 * A token belongs to a class when a span of that class covers its *start*.
 * A token both classes cover counts for both — which is how TOCHI's
 * three-class scheme behaves under overlap, and the only rule that does not
 * need a tie-break nobody could justify.
 */
export function labelTokens(text: string, spans: LabelledSpan[]): TokenLabels {
  const items = tokenize(text);
  const labels: TokenLabels = { purpose: [], mechanism: [] };
  for (const token of items) {
    for (const klass of CLASSES) {
      labels[klass].push(
        spans.some((span) => classOf(span.facet) === klass && span.start <= token.start && span.end > token.start),
      );
    }
  }
  return labels;
}

export interface ClassScore {
  precision: number;
  recall: number;
  f1: number;
  /** What the ratios were over, so a 0 that means "nothing to find" is
   *  tellable from a 0 that means "found nothing". */
  gold: number;
  predicted: number;
  hits: number;
}

const f1Of = (precision: number, recall: number) =>
  precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

/** Both empty is agreement, not failure: an abstract with no mechanism and
 *  a run that claimed none scores 1, and the `not_stated` column is where
 *  that is examined properly. */
function ratio(hits: number, total: number, otherTotal: number): number {
  if (total === 0) return otherTotal === 0 ? 1 : 0;
  return hits / total;
}

function scoreBooleans(gold: boolean[], predicted: boolean[]): ClassScore {
  let hits = 0;
  let goldCount = 0;
  let predictedCount = 0;
  for (let i = 0; i < Math.max(gold.length, predicted.length); i++) {
    const g = gold[i] ?? false;
    const p = predicted[i] ?? false;
    if (g) goldCount += 1;
    if (p) predictedCount += 1;
    if (g && p) hits += 1;
  }
  const precision = ratio(hits, predictedCount, goldCount);
  const recall = ratio(hits, goldCount, predictedCount);
  return { precision, recall, f1: f1Of(precision, recall), gold: goldCount, predicted: predictedCount, hits };
}

const key = (span: LabelledSpan) => `${span.start}:${span.end}`;

function scoreSpans(gold: LabelledSpan[], predicted: LabelledSpan[], klass: Klass): ClassScore {
  const goldKeys = new Set(gold.filter((s) => classOf(s.facet) === klass).map(key));
  const predictedKeys = new Set(predicted.filter((s) => classOf(s.facet) === klass).map(key));
  let hits = 0;
  for (const k of predictedKeys) if (goldKeys.has(k)) hits += 1;
  const precision = ratio(hits, predictedKeys.size, goldKeys.size);
  const recall = ratio(hits, goldKeys.size, predictedKeys.size);
  return {
    precision,
    recall,
    f1: f1Of(precision, recall),
    gold: goldKeys.size,
    predicted: predictedKeys.size,
    hits,
  };
}

export interface Score {
  token: Record<Klass, ClassScore>;
  span: Record<Klass, ClassScore>;
  /** Mean of the four F1s: token and exact-span, over both classes. */
  headline: number;
}

/** Score one artifact's predicted spans against its gold spans. */
export function score(text: string, gold: LabelledSpan[], predicted: LabelledSpan[]): Score {
  const goldLabels = labelTokens(text, gold);
  const predictedLabels = labelTokens(text, predicted);

  const token = {} as Record<Klass, ClassScore>;
  const span = {} as Record<Klass, ClassScore>;
  for (const klass of CLASSES) {
    token[klass] = scoreBooleans(goldLabels[klass], predictedLabels[klass]);
    span[klass] = scoreSpans(gold, predicted, klass);
  }

  // A class nobody claimed and nobody marked is not evidence. Scoring it 1
  // would let a run be carried by the facets an abstract happens to omit,
  // and would let one giant purpose span outscore its own token F1.
  const counted = [token.purpose, token.mechanism, span.purpose, span.mechanism].filter(
    (s) => s.gold > 0 || s.predicted > 0,
  );
  const headline =
    counted.length === 0 ? 1 : counted.reduce((n, s) => n + s.f1, 0) / counted.length;
  return { token, span, headline };
}

/** The 95% interval over per-artifact headlines. A mean of ten abstracts is
 *  a number with a width, and the width is printed. */
export function bootstrap(perArtifact: number[], seed = 1): Interval {
  return bootstrapCI(perArtifact, { seed });
}

/** Token Jaccard between two spans, over the same tokenization the bench
 *  uses — so reconciliation and the score cannot disagree about overlap. */
export function jaccard(text: string, a: { start: number; end: number }, b: { start: number; end: number }): number {
  const items = tokenize(text);
  const covers = (span: { start: number; end: number }, token: Token) =>
    span.start <= token.start && span.end > token.start;
  let intersection = 0;
  let union = 0;
  for (const token of items) {
    const inA = covers(a, token);
    const inB = covers(b, token);
    if (inA && inB) intersection += 1;
    if (inA || inB) union += 1;
  }
  return union === 0 ? 0 : intersection / union;
}
