import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { assertions, matchParams } from "@/db/schema";
import { EMBEDDING_DIMENSIONS } from "../embed";
import { insertAssertion } from "../ledger";
import type { AbstractionLevel, Facet, SubjectType } from "../schema";
import { bandpass, familyOf } from "./bandpass";

let db: Db;

const QUERY = "60000000-0000-4000-8000-000000000001";
const A = "60000000-0000-4000-8000-00000000000a";
const B = "60000000-0000-4000-8000-00000000000b";

/** A unit basis vector — orthogonal to every other basis vector, so a
 *  cosine is either 1 or 0 and the arithmetic is checkable by hand. */
const e = (i: number) => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, d) => (d === i ? 1 : 0));

/** A mixture, for a similarity strictly between 0 and 1. */
const mix = (i: number, j: number) =>
  Array.from({ length: EMBEDDING_DIMENSIONS }, (_, d) => (d === i || d === j ? Math.SQRT1_2 : 0));

async function put(
  subjectId: string,
  facet: Facet,
  text: string,
  embedding: number[] | null,
  level: AbstractionLevel | null = null,
  subjectType: SubjectType = "paper",
) {
  return insertAssertion(db, {
    subjectType,
    subjectId,
    facet,
    abstractionLevel: level,
    text,
    sourceType: "abstract",
    provenance: { kind: "document", document_id: subjectId },
    embedding,
    embeddingModel: embedding ? "voyage-3.5" : null,
  });
}

beforeAll(async () => {
  db = await createPgliteDb();
});

// One database, emptied between tests: a fresh PGlite per test runs the
// migrations twelve times for no isolation this file needs.
beforeEach(async () => {
  await db.delete(assertions);
  await db.update(matchParams).set({ lambda: 0.3, mu: 0.3 });
});

describe("familyOf", () => {
  it("puts every mechanism facet in one family and splits purpose by rung", () => {
    expect(familyOf("purpose", "specific")).toBe("spec");
    expect(familyOf("purpose", "abstract")).toBe("abs");
    expect(familyOf("purpose", "core")).toBe("abs");
    expect(familyOf("mechanism", null)).toBe("mech");
    expect(familyOf("mechanism.revenue", null)).toBe("mech");
    expect(familyOf("mechanism_sought", null)).toBe("mech");
    expect(familyOf("evidence", null)).toBe("evidence");
    expect(familyOf("domain", null)).toBe("domain");
    expect(familyOf("constraint", null)).toBe("domain");
  });
});

describe("bandpass", () => {
  it("is a mean of maxima, not the cosine of two averaged vectors", async () => {
    await put(QUERY, "purpose", "q1", e(0), "abstract");
    await put(QUERY, "purpose", "q2", e(1), "abstract");
    await put(A, "purpose", "a1", e(0), "abstract");
    await put(A, "purpose", "a2", e(1), "abstract");
    await put(A, "purpose", "a3", e(2), "abstract");

    const [result] = await bandpass(db, {
      edgeType: "paper_analogy",
      query: { subjectType: "paper", subjectId: QUERY },
      candidates: [{ subjectType: "paper", subjectId: A }],
      k: 5,
    });
    // Each query row finds its own match: mean of 1 and 1.
    expect(result.components.sim_abs).toBeCloseTo(1, 6);
    // Two averaged vectors would have given 0.8165.
    expect(result.components.sim_abs).not.toBeCloseTo(0.8165, 3);
  });

  it("names the pair behind each family's maximum", async () => {
    const q = await put(QUERY, "purpose", "q", e(0), "abstract");
    const hit = await put(A, "purpose", "hit", e(0), "abstract");
    await put(A, "purpose", "miss", e(5), "abstract");

    const [result] = await bandpass(db, {
      edgeType: "paper_analogy",
      query: { subjectType: "paper", subjectId: QUERY },
      candidates: [{ subjectType: "paper", subjectId: A }],
      k: 5,
    });
    expect(result.components.contributors.abs).toEqual({ query: q.id, candidate: hit.id });
  });

  it("scores a candidate whose only row has no embedding as zero, and still returns it", async () => {
    await put(QUERY, "purpose", "q", e(0), "abstract");
    await put(A, "purpose", "no vector", null, "abstract");

    const results = await bandpass(db, {
      edgeType: "paper_analogy",
      query: { subjectType: "paper", subjectId: QUERY },
      candidates: [{ subjectType: "paper", subjectId: A }],
      k: 5,
    });
    expect(results).toHaveLength(1);
    expect(results[0].components.sim_abs).toBe(0);
    expect(results[0].score).toBe(0);
    expect(results[0].components.contributors.abs).toBeUndefined();
  });

  it("takes lambda and mu from the edge's row, and leaves other edges alone", async () => {
    await put(QUERY, "purpose", "q-abs", e(0), "abstract");
    await put(QUERY, "purpose", "q-spec", e(1), "specific");
    await put(A, "purpose", "a-abs", e(0), "abstract");
    await put(A, "purpose", "a-spec", e(1), "specific");

    const call = (edgeType: "prior_art" | "paper_analogy") =>
      bandpass(db, {
        edgeType,
        query: { subjectType: "paper", subjectId: QUERY },
        candidates: [{ subjectType: "paper", subjectId: A }],
        k: 5,
      });

    // Seeded at 0.3: 1 − 0.3·1 = 0.7.
    expect((await call("prior_art"))[0].score).toBeCloseTo(0.7, 6);

    await db.update(matchParams).set({ lambda: 0.5 }).where(eq(matchParams.edgeType, "prior_art"));
    expect((await call("prior_art"))[0].score).toBeCloseTo(0.5, 6);
    // The other edge did not move.
    expect((await call("paper_analogy"))[0].score).toBeCloseTo(0.7, 6);
  });

  it("subtracts the mechanism family at mu", async () => {
    await put(QUERY, "purpose", "q-abs", e(0), "abstract");
    await put(QUERY, "mechanism", "q-mech", e(3));
    await put(A, "purpose", "a-abs", e(0), "abstract");
    await put(A, "mechanism.product", "a-mech", e(3));

    const [result] = await bandpass(db, {
      edgeType: "paper_analogy",
      query: { subjectType: "paper", subjectId: QUERY },
      candidates: [{ subjectType: "paper", subjectId: A }],
      k: 5,
    });
    expect(result.components.sim_mech).toBeCloseTo(1, 6);
    expect(result.score).toBeCloseTo(0.7, 6);
  });

  it("restricts the query side to the given assertions and scores them as one family", async () => {
    const c1 = await put(QUERY, "constraint", "must run offline", e(0));
    await put(QUERY, "constraint", "must be cheap", e(1));
    await put(QUERY, "purpose", "a purpose that must not take part", e(2), "abstract");
    await put(A, "purpose", "runs offline in the field", e(0), "abstract");

    const [result] = await bandpass(db, {
      edgeType: "idea_paper_analogy",
      query: { subjectType: "paper", subjectId: QUERY, assertionIds: [c1.id], asFamily: "abs" },
      candidates: [{ subjectType: "paper", subjectId: A }],
      k: 5,
    });
    // One query row, matching exactly: 1. The purpose row took no part —
    // with it the mean would have been 0.5.
    expect(result.components.sim_abs).toBeCloseTo(1, 6);
    expect(result.components.contributors.abs?.query).toBe(c1.id);
  });

  it("applies the caller's domain filter and never chooses one itself", async () => {
    await put(QUERY, "purpose", "q", e(0), "abstract");
    await put(A, "purpose", "a", e(0), "abstract");
    await put(A, "domain", "healthcare", e(9));
    await put(B, "purpose", "b", e(0), "abstract");
    await put(B, "domain", "logistics", e(8));

    const unfiltered = await bandpass(db, {
      edgeType: "paper_analogy",
      query: { subjectType: "paper", subjectId: QUERY },
      candidates: { subjectType: "paper" },
      k: 5,
    });
    expect(unfiltered.map((r) => r.subjectId).sort()).toEqual([A, B].sort());

    const filtered = await bandpass(db, {
      edgeType: "prior_art",
      query: { subjectType: "paper", subjectId: QUERY },
      candidates: { subjectType: "paper", domainFilter: ["healthcare"] },
      k: 5,
    });
    expect(filtered.map((r) => r.subjectId)).toEqual([A]);
  });

  it("never returns the query subject as its own candidate", async () => {
    await put(QUERY, "purpose", "q", e(0), "abstract");
    await put(A, "purpose", "a", e(0), "abstract");
    const results = await bandpass(db, {
      edgeType: "cofounder",
      query: { subjectType: "paper", subjectId: QUERY },
      candidates: { subjectType: "paper" },
      k: 5,
    });
    expect(results.map((r) => r.subjectId)).not.toContain(QUERY);
  });

  it("ignores superseded rows on both sides", async () => {
    await put(QUERY, "purpose", "q", e(0), "abstract");
    const stale = await put(A, "purpose", "the old reading", e(0), "abstract");
    await db.update(assertions).set({ status: "superseded" }).where(eq(assertions.id, stale.id));
    await put(A, "purpose", "the current reading", mix(0, 7), "abstract");

    const [result] = await bandpass(db, {
      edgeType: "paper_analogy",
      query: { subjectType: "paper", subjectId: QUERY },
      candidates: [{ subjectType: "paper", subjectId: A }],
      k: 5,
    });
    // The live row is a mixture: 1/√2, not the superseded row's 1.
    expect(result.components.sim_abs).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it("ranks by score and honours k", async () => {
    await put(QUERY, "purpose", "q", e(0), "abstract");
    await put(A, "purpose", "near", e(0), "abstract");
    await put(B, "purpose", "far", mix(0, 7), "abstract");

    const all = await bandpass(db, {
      edgeType: "paper_analogy",
      query: { subjectType: "paper", subjectId: QUERY },
      candidates: { subjectType: "paper" },
      k: 5,
    });
    expect(all.map((r) => r.subjectId)).toEqual([A, B]);
    const one = await bandpass(db, {
      edgeType: "paper_analogy",
      query: { subjectType: "paper", subjectId: QUERY },
      candidates: { subjectType: "paper" },
      k: 1,
    });
    expect(one).toHaveLength(1);
    expect(one[0].subjectId).toBe(A);
  });

  it("is the only band-pass in the harness", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const path = await import("node:path");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.ts$/.test(p) && !/bandpass(\.test)?\.ts$/.test(p)) {
          const src = readFileSync(p, "utf8");
          if (/sim_abs\s*[-−]\s*\w*lambda/i.test(src)) offenders.push(p);
        }
      }
    };
    walk(path.join(process.cwd(), "src", "harness"));
    expect(offenders).toEqual([]);
  });
});
