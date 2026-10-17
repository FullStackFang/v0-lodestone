import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseList } from "../../../src/harness/papers/ingest";
import { BLOCKS } from "../../../src/lodestone/cards";
import { EVAL_CARDS } from "./cards";
import { MARKS } from "./marks";
import { idKey } from "./metrics";

const KEYS = new Set<string>(BLOCKS.map(([k]) => k));
const DOI = /^10\.\d{4,9}\/\S+$/;
const OPENALEX = /^W\d+$/;
const marks = Object.entries(MARKS).flatMap(([slug, ms]) => ms.map((m) => ({ slug, ...m })));

describe("eval-set marks", () => {
  it("marks every one of the thirty cards, and only those", () => {
    expect(EVAL_CARDS).toHaveLength(30);
    expect(new Set(Object.keys(MARKS))).toEqual(new Set(EVAL_CARDS.map((c) => c.slug)));
    for (const c of EVAL_CARDS) expect(MARKS[c.slug].length, c.slug).toBeGreaterThanOrEqual(2);
  });

  it("names a block key and a DOI or OpenAlex id for every mark", () => {
    for (const m of marks) {
      expect(KEYS.has(m.block), `${m.slug} ${m.id}`).toBe(true);
      const key = idKey(m.id);
      expect(DOI.test(key) || OPENALEX.test(key), `${m.slug} ${m.id}`).toBe(true);
    }
  });

  it("has at least ten cards with a mark from a field other than the card's", () => {
    const cross = EVAL_CARDS.filter((c) => MARKS[c.slug].some((m) => m.field !== c.field));
    expect(cross.length).toBeGreaterThanOrEqual(10);
  });

  // By id as written. A mark held by W id whose DOI is a distractor would
  // pass here; the marks were checked against the distractors' DOIs when chosen.
  it("never marks a distractor", () => {
    const distractors = new Set(
      parseList(readFileSync(path.join(__dirname, "distractors.txt"), "utf8")).map(idKey),
    );
    expect(marks.filter((m) => distractors.has(idKey(m.id)))).toEqual([]);
  });
});
