/** The coordinate system the reader and the extractor share.
 *
 * Offsets are UTF-16 code units, the unit DOM `Range` offsets and JS
 * `slice` both count. Postgres `substr` counts code points and disagrees on
 * any astral character, which is why nothing here — and nothing downstream —
 * slices in SQL.
 *
 * Highlights are rendered by *segmentation*, never by wrapping: the text is
 * split at the sorted set of every annotation boundary and each piece is one
 * span carrying the ids covering it. Concatenating the spans' text nodes
 * therefore yields the canonical text code unit for code unit, whatever the
 * overlaps, so the walk below is unaffected by how many highlights exist.
 *
 * These functions read only `nodeType`, `data` and `childNodes`. They run in
 * the browser against a real DOM and under test against a stand-in built
 * from the same segments the component renders. */

const TEXT_NODE = 3;

/** A node as this walk sees it — the three properties it reads, and no more. */
export interface WalkNode {
  nodeType: number;
  data?: string;
  childNodes: ArrayLike<WalkNode>;
}

export interface WalkRange {
  startContainer: WalkNode;
  startOffset: number;
  endContainer: WalkNode;
  endOffset: number;
}

const children = (node: WalkNode): WalkNode[] => Array.from(node.childNodes as ArrayLike<WalkNode>);

/** Code units of text under a node, in document order. */
export function textLength(node: WalkNode): number {
  if (node.nodeType === TEXT_NODE) return (node.data ?? "").length;
  let total = 0;
  for (const child of children(node)) total += textLength(child);
  return total;
}

/** The text of a container, concatenated in document order. Equal to the
 *  canonical text for a correctly rendered reading view. */
export function containerText(node: WalkNode): string {
  if (node.nodeType === TEXT_NODE) return node.data ?? "";
  let text = "";
  for (const child of children(node)) text += containerText(child);
  return text;
}

/** Code units before `(target, offset)` inside `root`, or null when the
 *  target is not inside it — a selection that started outside the reading
 *  container is not a selection of this text. */
export function offsetWithin(root: WalkNode, target: WalkNode, offset: number): number | null {
  let before = 0;
  let found: number | null = null;

  const visit = (node: WalkNode): boolean => {
    if (node === target) {
      if (node.nodeType === TEXT_NODE) {
        found = before + Math.min(offset, (node.data ?? "").length);
      } else {
        // On an element, a Range offset counts *children*, not characters.
        let at = before;
        const kids = children(node);
        for (let i = 0; i < offset && i < kids.length; i++) at += textLength(kids[i]);
        found = at;
      }
      return true;
    }
    if (node.nodeType === TEXT_NODE) {
      before += (node.data ?? "").length;
      return false;
    }
    for (const child of children(node)) if (visit(child)) return true;
    return false;
  };

  visit(root);
  return found;
}

/** True when cutting at `at` would split an astral character in half. */
export function splitsSurrogatePair(text: string, at: number): boolean {
  if (at <= 0 || at >= text.length) return false;
  const before = text.charCodeAt(at - 1);
  const after = text.charCodeAt(at);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

export interface Span {
  start: number;
  end: number;
}

/**
 * `[start, end)` in canonical code units for a selection inside the
 * container, or null.
 *
 * Null means "no popover": the selection is collapsed, it lies outside the
 * container, or a boundary falls between the two halves of a surrogate pair.
 * A pair is never split — half an emoji is not a quote.
 */
export function offsetsFromRange(container: WalkNode, range: WalkRange): Span | null {
  const a = offsetWithin(container, range.startContainer, range.startOffset);
  const b = offsetWithin(container, range.endContainer, range.endOffset);
  if (a === null || b === null) return null;

  const start = Math.min(a, b);
  const end = Math.max(a, b);
  if (start === end) return null;

  const text = containerText(container);
  if (splitsSurrogatePair(text, start) || splitsSurrogatePair(text, end)) return null;

  return { start, end };
}

export interface AnnotationSpan {
  id: string;
  start: number;
  end: number;
  /** Carried through so a segment can colour itself and a hover card can
   *  list what covers it. */
  tag?: string;
}

export interface TextSegment {
  start: number;
  end: number;
  text: string;
  /** Ids of every annotation covering this segment, in input order. */
  covering: string[];
}

/**
 * Split `text` at every annotation boundary.
 *
 * The result tiles the text exactly: segments are contiguous, non-empty and
 * their concatenation is the input. A segment's `covering` is every
 * annotation whose `[start, end)` contains it — which is what makes partial
 * overlaps render without nesting.
 */
export function segments(text: string, annotations: AnnotationSpan[]): TextSegment[] {
  const clamp = (n: number) => Math.max(0, Math.min(text.length, n));
  const live = annotations
    .map((a) => ({ id: a.id, start: clamp(a.start), end: clamp(a.end) }))
    .filter((a) => a.start < a.end);

  const cuts = new Set<number>([0, text.length]);
  for (const a of live) {
    cuts.add(a.start);
    cuts.add(a.end);
  }

  const ordered = [...cuts].sort((x, y) => x - y);
  const out: TextSegment[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const start = ordered[i];
    const end = ordered[i + 1];
    if (start === end) continue;
    out.push({
      start,
      end,
      text: text.slice(start, end),
      covering: live.filter((a) => a.start <= start && a.end >= end).map((a) => a.id),
    });
  }
  // A text with no annotations is one segment, not zero — the container
  // always has something to render.
  if (out.length === 0 && text.length > 0) {
    out.push({ start: 0, end: text.length, text, covering: [] });
  }
  return out;
}
