import { describe, expect, it } from "vitest";
import {
  ExtractionOutput,
  Facet,
  Judgment,
  Provenance,
  RunStats,
  Selectors,
} from "./schema";

describe("Facet", () => {
  it("is a closed vocabulary", () => {
    expect(Facet.safeParse("mechanism.product").success).toBe(true);
    expect(Facet.safeParse("mechanism").success).toBe(true);
    expect(Facet.safeParse("evidence").success).toBe(true);
    expect(Facet.safeParse("mechanism.pricing").success).toBe(false);
    expect(Facet.safeParse("vibe").success).toBe(false);
  });
});

describe("ExtractionOutput", () => {
  const one = {
    facet: "purpose",
    text: "reduce time to diagnosis",
    quote: "cut the time to a diagnosis",
    prefix: "the system aims to",
    subject: "paper",
  };

  it("requires a prefix on every assertion", () => {
    expect(ExtractionOutput.safeParse({ assertions: [one], not_stated: [] }).success).toBe(true);
    const { prefix: _dropped, ...withoutPrefix } = one;
    expect(
      ExtractionOutput.safeParse({ assertions: [withoutPrefix], not_stated: [] }).success,
    ).toBe(false);
  });

  it("lets a run declare nothing but absences", () => {
    const parsed = ExtractionOutput.parse({ assertions: [], not_stated: ["mechanism.revenue"] });
    expect(parsed.not_stated).toEqual(["mechanism.revenue"]);
  });

  it("carries an evidence type and an opaque derived object", () => {
    const parsed = ExtractionOutput.parse({
      assertions: [{ ...one, facet: "evidence", evidence_type: "incurred_cost" }],
      not_stated: [],
      derived: { transferable_insight: "latency is the product" },
    });
    expect(parsed.assertions[0].evidence_type).toBe("incurred_cost");
    expect(parsed.derived).toEqual({ transferable_insight: "latency is the product" });
  });
});

describe("Provenance", () => {
  it("keeps extension keys", () => {
    const parsed = Provenance.parse({
      kind: "annotation",
      annotation_id: "a1",
      session_id: "s1",
      reader_id: "r1",
      corroborated_by: "a2",
    });
    expect(parsed).toEqual({
      kind: "annotation",
      annotation_id: "a1",
      session_id: "s1",
      reader_id: "r1",
      corroborated_by: "a2",
    });
  });

  it("rejects a variant missing its required key", () => {
    expect(Provenance.safeParse({ kind: "ladder" }).success).toBe(false);
    expect(Provenance.safeParse({ kind: "ladder", ladder_of: "x" }).success).toBe(true);
    expect(Provenance.safeParse({ kind: "canvas", card_id: "c", field: "jtbd" }).success).toBe(false);
  });

  it("rejects an unknown kind", () => {
    expect(Provenance.safeParse({ kind: "vibes" }).success).toBe(false);
  });

  it("accepts a Forge row and keeps its side", () => {
    const row = {
      kind: "forge",
      idea_id: "0f3a",
      framework: "business_model",
      key: "e1",
      block: "channels",
      segment: "Drivers",
    };
    expect(Provenance.parse(row)).toEqual(row);
  });

  it("will not let a Forge row pose as a card row", () => {
    expect(
      Provenance.safeParse({
        kind: "canvas",
        idea_id: "0f3a",
        framework: "business_model",
        key: "e1",
        block: "channels",
        field: "channels",
      }).success,
    ).toBe(false);
    expect(Provenance.safeParse({ kind: "forge", idea_id: "0f3a", framework: "business_model" }).success).toBe(false);
  });
});

describe("RunStats", () => {
  it("is loose so an adapter may add counters", () => {
    const parsed = RunStats.parse({
      unanchored: 1,
      ambiguous: 0,
      dropped_invalid: 0,
      embedded: true,
      outside_window: 3,
      purpose: { count: 3, distinct: 2, mean_len: 40, not_stated: 0 },
    });
    expect(parsed.outside_window).toBe(3);
  });
});

describe("Selectors and Judgment", () => {
  it("selectors are strict", () => {
    expect(
      Selectors.safeParse({ start_off: 0, end_off: 4, quote: "abcd", prefix: "", suffix: "" }).success,
    ).toBe(true);
    expect(
      Selectors.safeParse({ start_off: 0, end_off: 4, quote: "abcd", prefix: "", suffix: "", extra: 1 })
        .success,
    ).toBe(false);
  });

  it("a judgment names its query and its result", () => {
    const base = {
      readerId: "p1",
      edgeType: "mentor",
      queryAssertionId: "a1",
      candidateSubjectId: "p2",
      candidateAssertionIds: ["a2"],
      matchResultId: "m1",
      rank: 0,
      verdict: "requested",
    };
    expect(Judgment.parse(base).context).toEqual({});
    expect(Judgment.safeParse({ ...base, edgeType: "nonesuch" }).success).toBe(false);
    expect(Judgment.safeParse({ ...base, verdict: "accepted" }).success).toBe(false);
  });
});
