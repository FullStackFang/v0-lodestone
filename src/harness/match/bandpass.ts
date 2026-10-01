/** The one band-pass scorer. Both tracks call it; neither owns a copy.
 *
 *     score = sim_abs − λ·sim_spec − μ·sim_mech
 *
 * The shape of the idea matches; the surface does not. λ and μ come from
 * `match_params` per edge, because abstracts and canvases have different
 * specificity profiles and a λ tuned on paper→paper does not transfer to
 * paper→idea.
 *
 * Every similarity is a **mean of maxima**, never the cosine of two averaged
 * vectors: one blended subject vector loses exactly the thing the ledger
 * exists to keep, which is that a subject asserts several separable things.
 *
 * Every subquery carries `embedding IS NOT NULL AND status = 'active'`. The
 * null predicate is not decoration: an HNSW scan silently drops
 * null-embedding rows while a sequential scan sorts them last, so without it
 * dev and prod disagree about which candidates exist at all. */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { assertions, matchParams } from "@/db/schema";
import { FAMILIES, type EdgeType, type Facet, type Family, type SubjectType } from "../schema";

/** Which family each facet is scored in. `mechanism*` is one family — a
 *  paper's method and a founder's product are the same axis. */
export function familyOf(facet: Facet, level: string | null): Family | null {
  if (facet === "purpose") return level === "specific" ? "spec" : "abs";
  if (facet.startsWith("mechanism")) return "mech";
  if (facet === "evidence") return "evidence";
  if (facet === "domain" || facet === "constraint" || facet === "evaluation") return "domain";
  return null;
}

export interface SubjectRef {
  subjectType: SubjectType;
  subjectId: string;
}

export interface BandpassQuery extends SubjectRef {
  /** Only these query rows take part. */
  assertionIds?: string[];
  /** Score those rows as this family whatever their facet — the
   *  constraint-as-query source. */
  asFamily?: Family;
}

export interface BandpassInput {
  edgeType: EdgeType;
  query: BandpassQuery;
  /** An explicit candidate list, or a shape to select by. The domain filter
   *  is the caller's: different-domain for the analogy edges, same-domain
   *  for `prior_art`. The scorer does not decide it. */
  candidates: SubjectRef[] | { subjectType: SubjectType; domainFilter?: string[] };
  k: number;
}

export interface Contributor {
  query: string;
  candidate: string;
}

export interface BandpassComponents {
  sim_abs: number;
  sim_spec: number;
  sim_mech: number;
  sim_domain: number;
  sim_evidence: number;
  contributors: Partial<Record<Family, Contributor>>;
}

export interface BandpassCandidate extends SubjectRef {
  score: number;
  components: BandpassComponents;
}

interface Row {
  id: string;
  subjectId: string;
  subjectType: SubjectType;
  family: Family;
  embedding: number[] | null;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Active, embedded rows for a set of subjects, bucketed by family. */
async function embeddedRows(
  db: Db,
  where: ReturnType<typeof and>,
  asFamily?: Family,
): Promise<Row[]> {
  const rows = await db
    .select({
      id: assertions.id,
      subjectId: assertions.subjectId,
      subjectType: assertions.subjectType,
      facet: assertions.facet,
      abstractionLevel: assertions.abstractionLevel,
      embedding: assertions.embedding,
    })
    .from(assertions)
    .where(and(where, eq(assertions.status, "active"), sql`${assertions.embedding} is not null`));

  const out: Row[] = [];
  for (const row of rows) {
    if (!row.facet || !row.embedding) continue;
    const family = asFamily ?? familyOf(row.facet, row.abstractionLevel);
    if (!family) continue;
    out.push({
      id: row.id,
      subjectId: row.subjectId,
      subjectType: row.subjectType,
      family,
      embedding: row.embedding,
    });
  }
  return out;
}

/** The mean over the query's rows in `family` of the maximum cosine to the
 *  candidate's rows in the same family, and the pair that produced the
 *  largest of those maxima. */
function meanOfMax(queryRows: Row[], candidateRows: Row[]): { value: number; contributor?: Contributor } {
  if (queryRows.length === 0 || candidateRows.length === 0) return { value: 0 };
  let total = 0;
  let best = -Infinity;
  let contributor: Contributor | undefined;
  for (const q of queryRows) {
    let max = 0;
    let at: Row | undefined;
    for (const c of candidateRows) {
      const similarity = cosine(q.embedding!, c.embedding!);
      if (similarity > max || at === undefined) {
        max = Math.max(similarity, 0);
        at = c;
      }
    }
    total += max;
    if (max > best && at) {
      best = max;
      contributor = { query: q.id, candidate: at.id };
    }
  }
  return { value: total / queryRows.length, contributor };
}

export async function bandpass(db: Db, input: BandpassInput): Promise<BandpassCandidate[]> {
  const [params] = await db.select().from(matchParams).where(eq(matchParams.edgeType, input.edgeType));
  const lambda = params?.lambda ?? 0.3;
  const mu = params?.mu ?? 0.3;

  const queryWhere = input.query.assertionIds
    ? and(
        eq(assertions.subjectId, input.query.subjectId),
        inArray(assertions.id, input.query.assertionIds),
      )
    : eq(assertions.subjectId, input.query.subjectId);
  const queryRows = await embeddedRows(db, queryWhere, input.query.asFamily);

  const explicit = Array.isArray(input.candidates);
  const candidateSubjects: SubjectRef[] = explicit
    ? (input.candidates as SubjectRef[])
    : await listCandidates(db, input.candidates as { subjectType: SubjectType; domainFilter?: string[] }, input.query.subjectId);

  if (candidateSubjects.length === 0) return [];

  const candidateRows = await embeddedRows(
    db,
    inArray(
      assertions.subjectId,
      candidateSubjects.map((c) => c.subjectId),
    ),
  );
  const bySubject = new Map<string, Row[]>();
  for (const row of candidateRows) {
    const list = bySubject.get(row.subjectId) ?? [];
    list.push(row);
    bySubject.set(row.subjectId, list);
  }

  const scored: BandpassCandidate[] = candidateSubjects.map((candidate) => {
    const theirs = bySubject.get(candidate.subjectId) ?? [];
    const components: BandpassComponents = {
      sim_abs: 0,
      sim_spec: 0,
      sim_mech: 0,
      sim_domain: 0,
      sim_evidence: 0,
      contributors: {},
    };
    for (const family of FAMILIES) {
      const { value, contributor } = meanOfMax(
        queryRows.filter((r) => r.family === family),
        theirs.filter((r) => r.family === family),
      );
      components[`sim_${family}` as keyof BandpassComponents] = value as never;
      if (contributor) components.contributors[family] = contributor;
    }
    return {
      ...candidate,
      score: components.sim_abs - lambda * components.sim_spec - mu * components.sim_mech,
      components,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, input.k);
}

/** Candidate subjects of one type, excluding the query subject itself.
 *  `domainFilter` is a list of `domain` texts the caller wants kept — the
 *  scorer applies it, it does not choose it. */
async function listCandidates(
  db: Db,
  shape: { subjectType: SubjectType; domainFilter?: string[] },
  exclude: string,
): Promise<SubjectRef[]> {
  const rows = await db
    .selectDistinct({ subjectId: assertions.subjectId, subjectType: assertions.subjectType })
    .from(assertions)
    .where(and(eq(assertions.subjectType, shape.subjectType), eq(assertions.status, "active")));

  const ids = rows.map((r) => r.subjectId).filter((id) => id !== exclude);
  if (!shape.domainFilter || shape.domainFilter.length === 0) {
    return ids.map((subjectId) => ({ subjectId, subjectType: shape.subjectType }));
  }

  const domains = await db
    .select({ subjectId: assertions.subjectId, text: assertions.text })
    .from(assertions)
    .where(
      and(
        inArray(assertions.subjectId, ids.length > 0 ? ids : [""]),
        eq(assertions.facet, "domain"),
        eq(assertions.status, "active"),
      ),
    );
  const wanted = new Set(shape.domainFilter.map((d) => d.toLowerCase()));
  const keep = new Set(domains.filter((d) => wanted.has(d.text.toLowerCase())).map((d) => d.subjectId));
  return ids.filter((id) => keep.has(id)).map((subjectId) => ({ subjectId, subjectType: shape.subjectType }));
}
