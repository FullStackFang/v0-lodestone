/** The labelled pairs are a fixture, and a fixture that names a paper the
 *  seed set does not contain scores nothing. This checks the shape and the
 *  references; scoring them is `bench -- pairs`, which the founder track
 *  lands. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseList } from "@/harness/papers/ingest";

const DIR = path.join(process.cwd(), "evals", "harness", "papers");

interface Pair {
  query: string;
  kind?: string;
  asked_on: string;
  should: string[];
  should_not: string[];
  note: string;
}

const fixture = JSON.parse(readFileSync(path.join(DIR, "analogy-pairs.json"), "utf8")) as {
  edges: Record<string, Pair[]>;
};
const seed = new Set(parseList(readFileSync(path.join(DIR, "seed.txt"), "utf8")));

describe("analogy-pairs.json", () => {
  it("covers both edges, with the analogy edge in the majority", () => {
    expect(Object.keys(fixture.edges).sort()).toEqual(["paper_analogy", "prior_art"]);
    expect(fixture.edges.paper_analogy.length).toBeGreaterThanOrEqual(7);
    expect(fixture.edges.prior_art.length).toBeGreaterThanOrEqual(2);
  });

  it("names only papers the seed set ingests", () => {
    for (const [edge, pairs] of Object.entries(fixture.edges)) {
      for (const pair of pairs) {
        for (const doi of [pair.asked_on, ...pair.should, ...pair.should_not]) {
          expect(seed.has(doi), `${edge}: ${doi}`).toBe(true);
        }
      }
    }
  });

  it("never asks for a paper it also forbids", () => {
    for (const pairs of Object.values(fixture.edges)) {
      for (const pair of pairs) {
        for (const doi of pair.should) expect(pair.should_not).not.toContain(doi);
        // A query is never its own answer.
        expect(pair.should).not.toContain(pair.asked_on);
      }
    }
  });

  it("gives every pair a reason a person can disagree with", () => {
    for (const pairs of Object.values(fixture.edges)) {
      for (const pair of pairs) {
        expect(pair.query.length).toBeGreaterThan(20);
        expect(pair.note.length).toBeGreaterThan(40);
      }
    }
  });

  it("carries the two constraint-driven queries the second query source exists for", () => {
    const constraints = fixture.edges.paper_analogy.filter((p) => p.kind === "constraint");
    expect(constraints).toHaveLength(2);
    for (const pair of constraints) expect(pair.should).toHaveLength(1);
  });
});
