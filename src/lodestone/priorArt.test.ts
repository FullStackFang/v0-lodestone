import { describe, expect, it } from "vitest";
import { fieldQuota } from "./priorArt";

const hit = (id: string, field: string | null) => ({ id, field });

describe("fieldQuota", () => {
  it("takes hits in order, at most three per field, until k are taken", () => {
    const hits = [
      hit("a", "Medicine"), hit("b", "Medicine"), hit("c", "Medicine"), hit("d", "Medicine"),
      hit("e", "Engineering"), hit("f", "Medicine"), hit("g", "Economics"),
    ];
    expect(fieldQuota(hits, 5).map((h) => h.id)).toEqual(["a", "b", "c", "e", "g"]);
  });

  it("counts a missing field as a bucket of its own", () => {
    const hits = [hit("a", null), hit("b", null), hit("c", null), hit("d", null), hit("e", "Medicine")];
    expect(fieldQuota(hits, 5).map((h) => h.id)).toEqual(["a", "b", "c", "e"]);
  });

  it("returns a short list rather than breaking the quota", () => {
    const hits = [hit("a", "X"), hit("b", "X"), hit("c", "X"), hit("d", "X")];
    expect(fieldQuota(hits, 10).map((h) => h.id)).toEqual(["a", "b", "c"]);
  });

  it("takes a custom cap, and Infinity turns the quota off", () => {
    const hits = [hit("a", "X"), hit("b", "X"), hit("c", "Y")];
    expect(fieldQuota(hits, 3, 1).map((h) => h.id)).toEqual(["a", "c"]);
    expect(fieldQuota(hits, 2, Infinity).map((h) => h.id)).toEqual(["a", "b"]);
  });
});
