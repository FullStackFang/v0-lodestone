import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseList } from "../../../src/harness/papers/ingest";
import { idKey, meanScores, scoreCard, statusOf, type Mark, type ScoredHit } from "./metrics";

const hit = (key: string, blocks: string[], field: string | null = null): ScoredHit => ({ keys: [key], blocks, field });
const marks: Mark[] = [
  { id: "https://doi.org/10.1/A", block: "problem" },
  { id: "W123", block: "solution" },
  { id: "10.1/never-found", block: "customer" },
];
const distractors = new Set(["10.9/d1", "W900"]);

describe("idKey", () => {
  it("compares DOIs and OpenAlex ids in one form", () => {
    expect(idKey("https://doi.org/10.1/A")).toBe("10.1/a");
    expect(idKey("doi:10.1/A")).toBe("10.1/a");
    expect(idKey("https://openalex.org/w123")).toBe("W123");
  });
});

describe("statusOf", () => {
  it("names a marked hit by whether its blocks hold the mark's", () => {
    expect(statusOf(hit("10.1/a", ["problem", "customer"]), marks, distractors)).toBe("relevant");
    expect(statusOf(hit("W123", ["problem"]), marks, distractors)).toBe("wrong-block");
    expect(statusOf(hit("10.9/d1", ["problem"]), marks, distractors)).toBe("distractor");
    expect(statusOf(hit("10.5/other", ["problem"]), marks, distractors)).toBe("unmarked");
  });
});

describe("scoreCard", () => {
  // Ranks: 1 distractor, 2 relevant, 3 wrong-block, 4 unmarked, 5 distractor, 6–10 distractors.
  const ranking = [
    hit("10.9/d1", ["problem"], "Economics"),
    hit("10.1/a", ["problem"], "Medicine"),
    hit("W123", ["customer"], "Medicine"),
    hit("10.5/other", ["solution"], null),
    hit("W900", ["solution"], "Engineering"),
    ...Array.from({ length: 6 }, (_, i) => hit(`10.9/x${i}`, ["solution"], "Economics")),
  ];

  it("counts a found document however the block went, and keeps the block miss apart", () => {
    const s = scoreCard(ranking, marks, distractors);
    expect(s.precisionAt5).toBe(2 / 5);
    expect(s.recallAt10).toBe(2 / 3);
    expect(s.reciprocalRank).toBe(1 / 2);
    expect(s.fields).toBe(3);
    expect(s.wrongBlock).toBe(1);
    expect(s.statuses.slice(0, 5)).toEqual(["distractor", "relevant", "wrong-block", "unmarked", "distractor"]);
    expect(s.statuses).toHaveLength(10);
  });

  it("scores a card that found nothing as zero", () => {
    expect(scoreCard([hit("10.9/d1", ["problem"])], marks, distractors)).toMatchObject({ precisionAt5: 0, recallAt10: 0, reciprocalRank: 0 });
  });
});

describe("meanScores", () => {
  it("averages each number over the cards", () => {
    const a = scoreCard([hit("10.1/a", ["problem"], "Medicine")], marks, distractors);
    const b = scoreCard([hit("10.9/d1", ["problem"], "Economics"), hit("W123", ["solution"], "Medicine")], marks, distractors);
    expect(meanScores([a, b])).toEqual({ cards: 2, precisionAt5: (1 / 5 + 1 / 5) / 2, recallAt10: (1 / 3 + 1 / 3) / 2, mrr: (1 + 1 / 2) / 2, fields: (1 + 2) / 2 });
  });
});

describe("distractors.txt", () => {
  it("holds the six query sets, every line a DOI or an OpenAlex id, none twice", () => {
    const ids = parseList(readFileSync(new URL("./distractors.txt", import.meta.url), "utf8"));
    expect(ids.length).toBeGreaterThan(900);
    expect(ids.every((id) => /^10\.\S+\/\S+$/.test(id) || /^W\d+$/.test(id))).toBe(true);
    expect(new Set(ids.map(idKey)).size).toBe(ids.length);
  });
});
