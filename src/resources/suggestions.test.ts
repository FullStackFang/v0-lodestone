import { describe, expect, it } from "vitest";
import { selectSuggestions } from "./suggestions";

describe("focused suggestions", () => {
  it("selects the best three per need, excludes dismissals and scopes to an idea", () => {
    const rows = [1, 2, 3, 4, 5].map(score => ({
      need: { id: "need", cardId: "mine" }, recommendation: { id: String(score), score, outcome: score === 5 ? "dismissed" : null },
    }));
    rows.push({ need: { id: "other", cardId: "another" }, recommendation: { id: "foreign", score: 100, outcome: null } });
    expect(selectSuggestions(rows, "mine").map(r => r.recommendation.id)).toEqual(["4", "3", "2"]);
    expect(selectSuggestions(rows, "mine", true).map(r => r.recommendation.id)).toEqual(["4", "3", "2", "1"]);
    expect(selectSuggestions(rows, "missing")).toEqual([]);
  });
});
