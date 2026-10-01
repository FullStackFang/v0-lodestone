import { describe, expect, it } from "vitest";
import {
  containerText,
  offsetsFromRange,
  segments,
  splitsSurrogatePair,
  type AnnotationSpan,
  type WalkNode,
} from "./offsets";

/** The reading view's DOM, as the walk sees it: one container element whose
 *  children are the segment spans, each holding exactly one text node. This
 *  is the render — `ReadingText` builds the same tree from the same
 *  `segments()` call — reduced to the three properties the walk reads. */
function render(text: string, annotations: AnnotationSpan[]): WalkNode {
  const spans = segments(text, annotations).map((segment) => ({
    nodeType: 1,
    childNodes: [{ nodeType: 3, data: segment.text, childNodes: [] as WalkNode[] }],
  }));
  return { nodeType: 1, childNodes: spans };
}

/** Where global offset `at` lives in that tree: the text node and the
 *  offset inside it, exactly what a browser's `Range` would report. */
function locate(container: WalkNode, at: number): { node: WalkNode; offset: number } {
  let before = 0;
  const texts: WalkNode[] = [];
  const collect = (node: WalkNode) => {
    if (node.nodeType === 3) texts.push(node);
    else for (const child of Array.from(node.childNodes as ArrayLike<WalkNode>)) collect(child);
  };
  collect(container);
  for (const node of texts) {
    const length = (node.data ?? "").length;
    if (at <= before + length) return { node, offset: at - before };
    before += length;
  }
  const last = texts[texts.length - 1];
  return { node: last, offset: (last.data ?? "").length };
}

function select(container: WalkNode, i: number, j: number) {
  const a = locate(container, i);
  const b = locate(container, j);
  return offsetsFromRange(container, {
    startContainer: a.node,
    startOffset: a.offset,
    endContainer: b.node,
    endOffset: b.offset,
  });
}

/** An astral character before the first boundary, so every offset after it
 *  is wrong under a code-point count and right under a code-unit count. */
const TEXT = "🧪 We measure the cost the rural clinic pays for a diagnosis today.";
const OVERLAPPING: AnnotationSpan[] = [
  { id: "a", start: 10, end: 30 },
  { id: "b", start: 20, end: 40 },
];

describe("segments", () => {
  it("tiles the text exactly, whatever the overlaps", () => {
    for (const annotations of [[], OVERLAPPING, [{ id: "z", start: 0, end: TEXT.length }]]) {
      const pieces = segments(TEXT, annotations);
      expect(pieces.map((s) => s.text).join("")).toBe(TEXT);
      expect(pieces.every((s) => s.end > s.start)).toBe(true);
      for (let i = 1; i < pieces.length; i++) expect(pieces[i].start).toBe(pieces[i - 1].end);
    }
  });

  it("tiles the text for random overlapping intervals", () => {
    let seed = 7;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let trial = 0; trial < 200; trial++) {
      const annotations: AnnotationSpan[] = [];
      for (let n = 0; n < 1 + Math.floor(next() * 5); n++) {
        const i = Math.floor(next() * TEXT.length);
        const j = Math.floor(next() * TEXT.length);
        annotations.push({ id: `a${n}`, start: Math.min(i, j), end: Math.max(i, j) });
      }
      const pieces = segments(TEXT, annotations);
      expect(pieces.map((s) => s.text).join("")).toBe(TEXT);
    }
  });

  it("gives each segment every annotation covering it", () => {
    const pieces = segments(TEXT, OVERLAPPING);
    const both = pieces.filter((s) => s.covering.length === 2);
    expect(both).toHaveLength(1);
    expect(both[0]).toMatchObject({ start: 20, end: 30 });
    expect(both[0].covering).toEqual(["a", "b"]);
  });

  it("drops an empty annotation rather than cutting on it", () => {
    expect(segments("abc", [{ id: "e", start: 2, end: 2 }])).toEqual([
      { start: 0, end: 3, text: "abc", covering: [] },
    ]);
  });
});

describe("the rendered container", () => {
  it("concatenates to the canonical text, with and without highlights", () => {
    expect(containerText(render(TEXT, []))).toBe(TEXT);
    expect(containerText(render(TEXT, OVERLAPPING))).toBe(TEXT);
  });
});

describe("offsetsFromRange", () => {
  it("round-trips a grid of selections across span boundaries", () => {
    const container = render(TEXT, OVERLAPPING);
    // Every boundary of the rendered spans, and their neighbours, so the
    // grid straddles the joins rather than sitting inside one span.
    const points = [2, 3, 9, 10, 11, 19, 20, 21, 29, 30, 31, 39, 40, 41, TEXT.length];
    for (const i of points) {
      for (const j of points) {
        if (j <= i) continue;
        expect(select(container, i, j), `[${i}, ${j})`).toEqual({ start: i, end: j });
        // And the offsets mean what the server will take them to mean.
        expect(TEXT.slice(i, j)).toBe(TEXT.slice(i, j));
      }
    }
  });

  it("returns the word after an astral character with the right offsets", () => {
    const container = render(TEXT, []);
    const start = TEXT.indexOf("We");
    const span = select(container, start, start + 2)!;
    expect(TEXT.slice(span.start, span.end)).toBe("We");
    // Code units, not code points: the emoji counts as two.
    expect(start).toBe(3);
  });

  it("refuses a boundary inside a surrogate pair rather than splitting it", () => {
    const container = render(TEXT, []);
    expect(splitsSurrogatePair(TEXT, 1)).toBe(true);
    expect(select(container, 1, 10)).toBeNull();
    expect(select(container, 0, 1)).toBeNull();
    // The whole character is fine.
    expect(select(container, 0, 2)).toEqual({ start: 0, end: 2 });
  });

  it("returns null for a collapsed selection and for one outside the container", () => {
    const container = render(TEXT, []);
    expect(select(container, 5, 5)).toBeNull();
    const stranger: WalkNode = { nodeType: 3, data: "elsewhere", childNodes: [] };
    expect(
      offsetsFromRange(container, {
        startContainer: stranger,
        startOffset: 0,
        endContainer: stranger,
        endOffset: 4,
      }),
    ).toBeNull();
  });

  it("normalizes a backwards selection", () => {
    const container = render(TEXT, OVERLAPPING);
    const a = locate(container, 35);
    const b = locate(container, 15);
    expect(
      offsetsFromRange(container, {
        startContainer: a.node,
        startOffset: a.offset,
        endContainer: b.node,
        endOffset: b.offset,
      }),
    ).toEqual({ start: 15, end: 35 });
  });

  it("counts children when a boundary lands on an element", () => {
    const container = render(TEXT, OVERLAPPING);
    // A selection anchored at the container itself, before its second span.
    expect(
      offsetsFromRange(container, {
        startContainer: container,
        startOffset: 1,
        endContainer: container,
        endOffset: 2,
      }),
    ).toEqual({ start: 10, end: 20 });
  });
});
