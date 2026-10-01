/** One query, seven components, every one written down.
 *
 * A subject is never one vector: candidates are generated with pgvector's
 * `<=>` over individual assertions and then scored exactly in TypeScript
 * over the union, facet by facet. What comes back is a ranking *and* its
 * arithmetic — `components` is what `match_results` stores and what makes a
 * card explicable later.
 *
 * λ and μ are read from `match_params` on every call. A `null` component
 * contributes nothing and is named in `excluded`/`unknown` rather than
 * silently counted as zero.
 */
import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { assertions, matchParams, type AssertionRow } from "@/db/schema";
import { founderPreferences } from "@/db/matching-schema";
import type { EdgeType, Facet } from "../schema";
import { commitmentCompatible, cover, facetSim, topPair } from "./score";
import { compatiblePreferences, matchingRows, preferencesFor } from "./preferences";
import { COFOUNDER, type Weights } from "./weights";
import { assertActiveMember } from "@/pilot/membership";

/** How many rows the vector index returns per query assertion before exact
 *  scoring. Cohort-sized; the bench would show a miss. */
const CANDIDATE_DEPTH = 50;

export interface Contribution {
  query: string;
  candidate: string;
  family: string;
}

export interface QueryResult {
  candidateSubjectId: string;
  candidateSubjectType: "person" | "idea";
  score: number;
  components: Record<string, number | null>;
  contributions: Contribution[];
}

export interface Excluded {
  candidateSubjectId: string;
  reason: string;
}

export interface QueryOutcome {
  results: QueryResult[];
  excluded: Excluded[];
  /** Components that were `null` for every candidate — the card says so
   *  rather than pretending the term was zero. */
  unknown: string[];
}

const withFacet = (rows: AssertionRow[], facet: Facet, level?: string) =>
  rows.filter((r) => r.facet === facet && (level === undefined || r.abstractionLevel === level));

const mechanismRows = (rows: AssertionRow[]) => rows.filter((r) => r.facet === "mechanism_commanded");

/** Everything one person is: their own rows plus every card of theirs. */
interface Side {
  personId: string;
  cardIds: string[];
  person: AssertionRow[];
  idea: AssertionRow[];
}

async function sideOf(db: Db, personId: string): Promise<Side> {
  const rows = await matchingRows(db, personId);
  const person = rows.filter((r) => r.subjectType === "person");
  const idea = rows.filter((r) => r.subjectType === "idea");
  const cardIds = [...new Set(idea.map((r) => r.subjectId))];
  return { personId, cardIds, person, idea };
}

/** Every other person with at least one active embedded row, narrowed by
 *  the vector index to those near one of the query's rows. Self and every
 *  card of the query person are excluded by `person.id`. */
async function candidatePersons(db: Db, me: Side, eligible: Side[]): Promise<string[]> {
  const queryVectors = [...me.person, ...me.idea].filter((r) => r.embedding !== null);

  // With no embeddings anywhere (no provider key), fall back to every other
  // person: the exact scorer will then return null components and the
  // caller will see `unknown` rather than a confident empty list.
  if (queryVectors.length === 0) {
    return eligible.map((s) => s.personId);
  }

  const owner = new Map(eligible.flatMap((s) => [...s.person, ...s.idea].map((r) => [r.id, s.personId] as const)));
  if (owner.size === 0) return [];

  const near = new Set<string>();
  for (const row of queryVectors) {
    const vector = JSON.stringify(row.embedding);
    const rows = await db
      .select({ id: assertions.id })
      .from(assertions)
      .where(
        and(
          isNotNull(assertions.embedding),
          inArray(assertions.id, [...owner.keys()]),
        ),
      )
      .orderBy(sql`${assertions.embedding} <=> ${vector}::vector`)
      .limit(CANDIDATE_DEPTH);
    for (const r of rows) near.add(owner.get(r.id)!);
  }
  return [...near];
}

async function params(db: Db, edgeType: EdgeType): Promise<{ lambda: number; mu: number }> {
  const [row] = await db.select().from(matchParams).where(eq(matchParams.edgeType, edgeType));
  return { lambda: row?.lambda ?? 0.3, mu: row?.mu ?? 0.3 };
}

/**
 * Rank candidates for one subject on one edge.
 *
 * `cofounder` is the only edge built: `competitor` and `mentor` are
 * specified in `design.md` D6 and gated on the first hundred judgments.
 */
export async function query(
  db: Db,
  edgeType: EdgeType,
  subject: { personId: string },
  k: number,
  weights: Weights = COFOUNDER,
): Promise<QueryOutcome> {
  await assertActiveMember(db, subject.personId);
  if (edgeType !== "cofounder") {
    throw new Error(`${edgeType} is specified but not built — it ships after a hundred judgments`);
  }

  const me = await sideOf(db, subject.personId);
  const mine = await preferencesFor(db, subject.personId);
  if (!mine.discoverable || mine.availability === "unavailable") return { results: [], excluded: [], unknown: [] };
  const { lambda, mu } = await params(db, edgeType);
  const preferences = await db.select().from(founderPreferences)
    .where(and(eq(founderPreferences.discoverable, true), ne(founderPreferences.personId, subject.personId)));
  const eligible = await Promise.all(preferences.filter((p) => compatiblePreferences(mine, p)).map((p) => sideOf(db, p.personId)));
  const candidates = await candidatePersons(db, me, eligible);

  const results: QueryResult[] = [];
  const excluded: Excluded[] = [];
  const nullCounts = new Map<string, number>();

  for (const candidateId of candidates) {
    const them = eligible.find((s) => s.personId === candidateId)!;

    // A candidate has to be *someone*: a purpose to compare and a
    // capability to bring. Without either there is nothing to say.
    const theirPurposes = withFacet(them.idea, "purpose");
    if (theirPurposes.length === 0) {
      excluded.push({ candidateSubjectId: candidateId, reason: "purpose not stated in a shared idea" });
      continue;
    }
    if (mechanismRows(them.person).length === 0) {
      excluded.push({ candidateSubjectId: candidateId, reason: "capability not stated" });
      continue;
    }

    const components: Record<string, number | null> = {
      sim_purpose_abstract: facetSim(
        withFacet(me.idea, "purpose", "abstract"),
        withFacet(them.idea, "purpose", "abstract"),
      ),
      sim_purpose_specific: facetSim(
        withFacet(me.idea, "purpose", "specific"),
        withFacet(them.idea, "purpose", "specific"),
      ),
      sim_domain: facetSim(
        [...withFacet(me.idea, "domain"), ...withFacet(me.person, "domain")],
        [...withFacet(them.idea, "domain"), ...withFacet(them.person, "domain")],
      ),
      overlap_mechanism_commanded: facetSim(mechanismRows(me.person), mechanismRows(them.person)),
      // Symmetrised: a co-founder relation neither side wants is not one.
      cover_sought_commanded: mean([
        cover(withFacet(me.person, "mechanism_sought"), mechanismRows(them.person)),
        cover(withFacet(them.person, "mechanism_sought"), mechanismRows(me.person)),
      ]),
      commitment_compatible: commitmentCompatible(
        withFacet(me.person, "constraint"),
        withFacet(them.person, "constraint"),
      ),
      // Private draft turnover is not part of a published founder profile.
      velocity: null,
    };

    for (const [key, value] of Object.entries(components)) {
      if (value === null) nullCounts.set(key, (nullCounts.get(key) ?? 0) + 1);
    }

    const score =
      weights.abs * (components.sim_purpose_abstract ?? 0) +
      weights.spec * (components.sim_purpose_specific ?? 0) +
      weights.domain * (components.sim_domain ?? 0) -
      lambda * (components.overlap_mechanism_commanded ?? 0) +
      mu * (components.cover_sought_commanded ?? 0) +
      weights.commit * (components.commitment_compatible ?? 0) +
      weights.velocity * (components.velocity ?? 0);

    results.push({
      candidateSubjectId: candidateId,
      candidateSubjectType: "person",
      score,
      components,
      contributions: contributionsOf(me, them),
    });
  }

  results.sort((a, b) => b.score - a.score);
  const unknown = [...nullCounts.entries()]
    .filter(([, count]) => count === results.length && results.length > 0)
    .map(([key]) => key);

  return { results: results.slice(0, k), excluded, unknown };
}

function mean(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) return null;
  return known.reduce((n, v) => n + v, 0) / known.length;
}

/** Which of my rows pulled which of theirs — what a judgment names when the
 *  founder acts on the card. */
function contributionsOf(me: Side, them: Side): Contribution[] {
  const pairs: [string, AssertionRow[], AssertionRow[]][] = [
    ["purpose", withFacet(me.idea, "purpose"), withFacet(them.idea, "purpose")],
    ["mechanism_sought", withFacet(me.person, "mechanism_sought"), mechanismRows(them.person)],
    ["domain", withFacet(me.idea, "domain"), withFacet(them.idea, "domain")],
  ];
  const out: Contribution[] = [];
  for (const [family, mine, theirs] of pairs) {
    const pair = topPair(mine, theirs);
    if (pair) out.push({ ...pair, family });
  }
  return out;
}
