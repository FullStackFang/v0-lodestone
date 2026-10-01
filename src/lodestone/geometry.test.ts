import { describe, expect, it } from "vitest";
import { CLOSE, distanceProfile, kmeans, regionCount, regionLabels, tokens } from "./geometry";
import { testVector } from "./test-embed";

describe("distance profile", () => {
  it("bins every unordered pair once, closest band first", () => {
    const a = testVector("campus sublet housing students");
    const b = testVector("campus sublet housing students arriving");
    const c = testVector("dairy heat recovery propane barn");
    const { rows, pairs } = distanceProfile([a, b, c]);
    expect(pairs).toBe(3);
    expect(rows.reduce((n, r) => n + r.count, 0)).toBe(3);
    expect(rows[0].from).toBe(0.85);
    expect(rows.at(-1)?.from).toBeNull();
    expect(rows.filter((r) => r.close).map((r) => r.from)).toEqual([0.85, 0.8, 0.75]);
    expect(rows.find((r) => r.from === CLOSE)?.close).toBe(true);
  });
});

describe("regions", () => {
  it("scales the region count with the cohort and caps it", () => {
    expect(regionCount(0)).toBe(0);
    expect(regionCount(1)).toBe(1);
    expect(regionCount(2)).toBe(1);
    expect(regionCount(8)).toBe(2);
    expect(regionCount(24)).toBe(3);
    expect(regionCount(200)).toBe(6);
  });

  it("puts cards that share words together and names the region from them", () => {
    const docs = [
      "campus sublet for arriving international students",
      "sublet marketplace for students leaving campus housing",
      "heat recovery for small dairy barns burning propane",
      "dairy farms waste the heat they pay to make",
    ];
    const points = docs.map(testVector);
    const assignment = kmeans(points, 2);
    expect(assignment[0]).toBe(assignment[1]);
    expect(assignment[2]).toBe(assignment[3]);
    expect(assignment[0]).not.toBe(assignment[2]);
    const labels = regionLabels(docs, assignment, 2);
    const housing = labels[assignment[0]];
    const dairy = labels[assignment[2]];
    expect(housing).toMatch(/sublet|students|campus/);
    expect(dairy).toMatch(/dairy|heat|propane/);
  });

  it("is deterministic and handles k at or above n", () => {
    const points = ["one two", "three four", "five six"].map(testVector);
    expect(kmeans(points, 2)).toEqual(kmeans(points, 2));
    expect(kmeans(points, 3)).toEqual([0, 1, 2]);
    expect(kmeans([], 2)).toEqual([]);
  });
});

describe("tokens", () => {
  it("drops stop words, numbers and short fragments", () => {
    expect(tokens("The 3 students of a campus sublet-marketplace, and more")).toEqual(["students", "campus", "sublet-marketplace"]);
  });
});
