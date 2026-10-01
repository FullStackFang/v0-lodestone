/** The analogy query: a paper from somewhere else that solved the shape of
 *  your problem.
 *
 * Everything numeric here belongs to the contract. This module supplies two
 * things the scorer does not decide: which candidates are eligible, and
 * which query row a judgment should name. There is no cosine in the scoring
 * path, no λ, no μ, and no `match_params` lookup — a grep test says so, and
 * the reason is that two band-pass implementations in two tracks is exactly
 * the drift the contract exists to prevent.
 *
 * The domain filter compares OpenAlex's own `primary_topic.field`, carried
 * in `artifact_texts.provenance.field` since ingest. Comparing extracted
 * `domain` text instead would let "HCI" and "human-computer interaction"
 * through as different fields, which is the failure the filter exists to
 * stop. */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { artifactTexts, assertions } from "@/db/schema";
import { bandpass, type BandpassCandidate, type SubjectRef } from "../match/bandpass";
import type { EdgeType, Family } from "../schema";
import { attribute } from "./attribute";

/** Where a candidate came from. A paper that answers a question you asked
 *  and a paper that hands you a measurement for what you are stuck on are
 *  different kinds of useful. */
export type QuerySource = "question" | "constraint";

export interface AnalogyResult extends BandpassCandidate {
  source: QuerySource;
  /** The query row that produced the result, for the judgment. */
  queryAssertionId: string | null;
  /** The candidate rows that produced `sim_abs`. */
  candidateAssertionIds: string[];
}

export interface AnalogyOptions {
  k?: number;
  edgeType?: EdgeType;
  /** Same field instead of different — `prior_art` inverts the filter. */
  sameField?: boolean;
  /** Score the constraint rows as a second query. */
  withConstraints?: boolean;
}

const DEFAULT_K = 5;

/** Every paper artifact and the OpenAlex field it was ingested with. */
export async function paperFields(db: Db): Promise<Map<string, string | null>> {
  const rows = await db
    .select({
      artifactId: artifactTexts.artifactId,
      field: sql<string | null>`${artifactTexts.provenance} ->> 'field'`,
    })
    .from(artifactTexts)
    .where(eq(artifactTexts.sourceFormat, "abstract"));
  return new Map(rows.map((row) => [row.artifactId, row.field]));
}

/**
 * The fields to exclude for a query subject: the field of every artifact
 * its active assertions were written on.
 *
 * For a paper that is its own field. For a reader it is the field of the
 * papers their questions were asked in — which is the exclusion that
 * matters, since a reader deep in one literature does not need a fourth
 * paper from it.
 */
export async function exclusionFields(db: Db, query: SubjectRef): Promise<string[]> {
  const fields = await paperFields(db);
  if (query.subjectType === "paper") {
    const own = fields.get(query.subjectId);
    return own ? [own] : [];
  }
  const rows = await db
    .selectDistinct({ artifactId: assertions.sourceArtifactId })
    .from(assertions)
    .where(and(eq(assertions.subjectId, query.subjectId), eq(assertions.status, "active")));
  const out = new Set<string>();
  for (const row of rows) {
    const field = row.artifactId ? fields.get(row.artifactId) : null;
    if (field) out.add(field);
  }
  return [...out];
}

/** The artifacts the query subject's own assertions were written on. A
 *  paper cannot be its own prior art, and neither can the one the reader is
 *  reading: the questions came out of it. */
export async function originArtifacts(db: Db, query: SubjectRef): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ artifactId: assertions.sourceArtifactId })
    .from(assertions)
    .where(and(eq(assertions.subjectId, query.subjectId), eq(assertions.status, "active")));
  const out = new Set<string>([query.subjectId]);
  for (const row of rows) if (row.artifactId) out.add(row.artifactId);
  return out;
}

/** Candidate papers, after the field rule. A paper OpenAlex gave no field
 *  is never excluded by it — an unknown field is not a match. */
async function candidateSubjects(
  db: Db,
  query: SubjectRef,
  fields: string[],
  sameField: boolean,
): Promise<SubjectRef[]> {
  const all = await paperFields(db);
  const wanted = new Set(fields);
  const own = await originArtifacts(db, query);
  const out: SubjectRef[] = [];
  for (const [artifactId, field] of all) {
    if (own.has(artifactId)) continue;
    if (sameField) {
      if (!field || !wanted.has(field)) continue;
    } else if (field && wanted.has(field)) {
      continue;
    }
    out.push({ subjectId: artifactId, subjectType: "paper" });
  }
  return out;
}

/**
 * Whether the subject has anything to ask with.
 *
 * The scorer answers an empty query with a full list of zeroes — every
 * candidate ties, and the order is the order they came out of the table.
 * That is not a match, and each one would cost a rerank call to dress up as
 * a card. A reader who has asked nothing gets nothing.
 */
export async function hasQueryRows(db: Db, query: SubjectRef): Promise<boolean> {
  const rows = await db
    .select({ id: assertions.id })
    .from(assertions)
    .where(
      and(
        eq(assertions.subjectId, query.subjectId),
        eq(assertions.status, "active"),
        sql`${assertions.embedding} is not null`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** The subject's active `constraint` rows — the second query source. */
export async function constraintRows(db: Db, query: SubjectRef): Promise<string[]> {
  const rows = await db
    .select({ id: assertions.id })
    .from(assertions)
    .where(
      and(
        eq(assertions.subjectId, query.subjectId),
        eq(assertions.facet, "constraint"),
        eq(assertions.status, "active"),
        sql`${assertions.embedding} is not null`,
      ),
    );
  return rows.map((row) => row.id);
}

/**
 * Cross-domain analogies for a query subject.
 *
 * Two query sources, merged by best score per paper: the subject's purposes
 * as they stand, and — scored as if they were abstract purposes — its
 * constraint rows. A paper that hands you a measurement for the thing you
 * are stuck on moves you further than one that merely shares your verb.
 */
export async function analogies(
  db: Db,
  query: SubjectRef,
  options: AnalogyOptions = {},
): Promise<AnalogyResult[]> {
  const k = options.k ?? DEFAULT_K;
  const edgeType = options.edgeType ?? "paper_analogy";
  const sameField = options.sameField ?? false;

  if (!(await hasQueryRows(db, query))) return [];

  const fields = await exclusionFields(db, query);
  const candidates = await candidateSubjects(db, query, fields, sameField);
  if (candidates.length === 0) return [];

  const fromQuestions = await bandpass(db, { edgeType, query, candidates, k });
  const merged = new Map<string, { candidate: BandpassCandidate; source: QuerySource }>();
  for (const candidate of fromQuestions) merged.set(candidate.subjectId, { candidate, source: "question" });

  if (options.withConstraints !== false) {
    const assertionIds = await constraintRows(db, query);
    if (assertionIds.length > 0) {
      const fromConstraints = await bandpass(db, {
        edgeType,
        // Scored as the abstract-purpose family: a constraint is a problem
        // stated as a bound, and a paper's purpose is a problem stated as a
        // goal.
        query: { ...query, assertionIds, asFamily: "abs" as Family },
        candidates,
        k,
      });
      for (const candidate of fromConstraints) {
        const standing = merged.get(candidate.subjectId);
        if (!standing || candidate.score > standing.candidate.score) {
          merged.set(candidate.subjectId, { candidate, source: "constraint" });
        }
      }
    }
  }

  const ordered = [...merged.values()].sort((a, b) => b.candidate.score - a.candidate.score).slice(0, k);
  return Promise.all(
    ordered.map(async ({ candidate, source }) => ({
      ...candidate,
      source,
      ...(await attributionOf(db, query, candidate, source)),
    })),
  );
}

/** The contributor the scorer reported, or a lookup when it reported none. */
async function attributionOf(
  db: Db,
  query: SubjectRef,
  candidate: BandpassCandidate,
  source: QuerySource,
) {
  const contributor = candidate.components.contributors?.abs;
  if (contributor) {
    const ids = await familyIdsOf(db, candidate.subjectId);
    return { queryAssertionId: contributor.query, candidateAssertionIds: ids };
  }
  const assertionIds = source === "constraint" ? await constraintRows(db, query) : undefined;
  return attribute(db, { subjectId: query.subjectId, assertionIds }, candidate.subjectId, "abs");
}

/** The candidate's abstract-purpose rows — what `sim_abs` was computed
 *  over, and what a judgment records as the candidate side. */
async function familyIdsOf(db: Db, subjectId: string): Promise<string[]> {
  const rows = await db
    .select({ id: assertions.id })
    .from(assertions)
    .where(
      and(
        eq(assertions.subjectId, subjectId),
        eq(assertions.facet, "purpose"),
        inArray(assertions.abstractionLevel, ["abstract", "core"]),
        eq(assertions.status, "active"),
        sql`${assertions.embedding} is not null`,
      ),
    );
  return rows.map((row) => row.id);
}
