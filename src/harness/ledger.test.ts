import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { createSession } from "@/db/cards";
import {
  annotations,
  assertions,
  matchResults,
  person,
  readingSessions,
  session,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { putArtifactText } from "./canonical";
import {
  ConfidenceNotAllowed,
  QuoteMismatch,
  ensurePerson,
  insertAssertion,
  linkSession,
  readerPerson,
  recordJudgment,
  supersede,
  upgradeConfidence,
} from "./ledger";
import { EMBEDDING_DIMENSIONS } from "./embed";

const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TEXT = "The system cuts the time to a diagnosis in rural clinics.";

let db: Db;
let textHash: string;
/** [start, end) of "cuts the time to a diagnosis" in the canonical text. */
let span: { start: number; end: number; quote: string };

beforeAll(async () => {
  db = await createPgliteDb();
  const put = await putArtifactText(db, {
    artifactId: uuid(1),
    sourceFormat: "abstract",
    parser: "test-v1",
    text: TEXT,
  });
  textHash = put.textHash;
  const quote = "cuts the time to a diagnosis";
  const start = TEXT.indexOf(quote);
  span = { start, end: start + quote.length, quote };
});

/** A reading session by `readerId` with one annotation over the fixture. */
async function annotationBy(readerId: string): Promise<string> {
  const [rs] = await db
    .insert(readingSessions)
    .values({ readerId, artifactId: uuid(1), textHash, mode: "exhaustive" })
    .returning({ id: readingSessions.id });
  const [a] = await db
    .insert(annotations)
    .values({
      sessionId: rs.id,
      textHash,
      startOff: span.start,
      endOff: span.end,
      quote: span.quote,
      tag: "intent",
    })
    .returning({ id: annotations.id });
  return a.id;
}

function anchored(over: Partial<Parameters<typeof insertAssertion>[1]> = {}) {
  return {
    subjectType: "paper" as const,
    subjectId: uuid(1),
    facet: "purpose" as const,
    abstractionLevel: "specific" as const,
    text: "reduce time to diagnosis",
    sourceType: "abstract" as const,
    sourceArtifactId: uuid(1),
    textHash,
    startOff: span.start,
    endOff: span.end,
    quote: span.quote,
    provenance: { kind: "document" as const, document_id: uuid(1) },
    ...over,
  };
}

describe("insertAssertion — the quote must match", () => {
  it("recomputes prefix and suffix rather than trusting the caller", async () => {
    const row = await insertAssertion(db, anchored());
    expect(row.prefix).toBe(TEXT.slice(Math.max(0, span.start - 30), span.start));
    expect(row.suffix).toBe(TEXT.slice(span.end, span.end + 30));
    expect(row.confidence).toBe("extracted");
    expect(row.status).toBe("active");
  });

  it("rejects a quote that has drifted by one character, and writes nothing", async () => {
    const before = await db.select({ id: assertions.id }).from(assertions);
    await expect(insertAssertion(db, anchored({ quote: "cuts the time to a diagnoses" }))).rejects.toBeInstanceOf(
      QuoteMismatch,
    );
    const after = await db.select({ id: assertions.id }).from(assertions);
    expect(after).toHaveLength(before.length);
  });

  it("accepts a canvas source with no selectors", async () => {
    const row = await insertAssertion(db, {
      subjectType: "idea",
      subjectId: uuid(2),
      facet: "mechanism.product",
      text: "a triage app for rural clinics",
      sourceType: "canvas",
      provenance: { kind: "canvas", card_id: uuid(2), field: "offering", patch_event_id: uuid(3) },
    });
    expect(row.textHash).toBeNull();
    expect(row.quote).toBeNull();
  });

  it("accepts a reader's query as a note rather than a slice", async () => {
    const annotationId = await annotationBy(uuid(90));
    const row = await insertAssertion(db, {
      subjectType: "person",
      subjectId: uuid(90),
      facet: null,
      text: "does this transfer to veterinary triage?",
      sourceType: "annotation",
      provenance: { kind: "annotation", annotation_id: annotationId, context_quote: span.quote },
    });
    expect(row.facet).toBeNull();
    expect(row.startOff).toBeNull();
  });
});

describe("insertAssertion — the top two rungs are not a model's to write", () => {
  it("rejects confirmed from an extraction", async () => {
    await expect(insertAssertion(db, anchored({ confidence: "confirmed" }))).rejects.toBeInstanceOf(
      ConfidenceNotAllowed,
    );
  });

  it("accepts confirmed from a subject edit", async () => {
    const row = await insertAssertion(db, {
      subjectType: "person",
      subjectId: uuid(91),
      facet: "purpose",
      text: "I want to fix rural triage",
      sourceType: "subject_edit",
      confidence: "confirmed",
      provenance: { kind: "subject_edit", person_id: uuid(91) },
    });
    expect(row.confidence).toBe("confirmed");
  });

  it("rejects corroborated by the subject's own highlight", async () => {
    const subjectId = uuid(92);
    const annotationId = await annotationBy(subjectId);
    await expect(
      insertAssertion(
        db,
        anchored({
          subjectType: "person",
          subjectId,
          confidence: "corroborated",
          provenance: { kind: "annotation", annotation_id: annotationId, corroborated_by: annotationId },
        }),
      ),
    ).rejects.toBeInstanceOf(ConfidenceNotAllowed);
  });

  it("rejects corroborated with no named source", async () => {
    await expect(insertAssertion(db, anchored({ confidence: "corroborated" }))).rejects.toBeInstanceOf(
      ConfidenceNotAllowed,
    );
  });
});

describe("upgradeConfidence", () => {
  it("moves one rung and no more", async () => {
    const row = await insertAssertion(db, anchored({ subjectId: uuid(10) }));
    await expect(upgradeConfidence(db, row.id, "corroborated", {})).rejects.toBeInstanceOf(ConfidenceNotAllowed);
    await expect(upgradeConfidence(db, row.id, "confirmed")).rejects.toBeInstanceOf(ConfidenceNotAllowed);
  });

  it("refuses repeated from the source the assertion already came from", async () => {
    const row = await insertAssertion(db, anchored({ subjectId: uuid(11) }));
    await expect(
      upgradeConfidence(db, row.id, "repeated", { sourceArtifactId: uuid(1) }),
    ).rejects.toBeInstanceOf(ConfidenceNotAllowed);
    const [after] = await db.select().from(assertions).where(eq(assertions.id, row.id));
    expect(after.confidence).toBe("extracted");
  });

  it("lets a person repeat across sessions of the same person", async () => {
    const row = await insertAssertion(db, {
      subjectType: "person",
      subjectId: uuid(12),
      facet: "purpose",
      text: "fix rural triage",
      sourceType: "conversation",
      provenance: { kind: "conversation", stage_event_id: uuid(20) },
    });
    const up = await upgradeConfidence(db, row.id, "repeated", { stageEventId: uuid(21) });
    expect(up.confidence).toBe("repeated");
    expect((up.provenance as Record<string, unknown>).repeated_by).toBe(uuid(21));
  });

  it("takes a classmate's highlight as corroboration", async () => {
    const subjectId = uuid(13);
    const row = await insertAssertion(db, anchored({ subjectType: "person", subjectId }));
    const mine = await annotationBy(subjectId);
    await expect(upgradeConfidence(db, row.id, "repeated", { sourceArtifactId: uuid(30) })).resolves.toBeTruthy();
    // Own highlight: refused.
    await expect(upgradeConfidence(db, row.id, "corroborated", { annotationId: mine })).rejects.toBeInstanceOf(
      ConfidenceNotAllowed,
    );
    const theirs = await annotationBy(uuid(14));
    const up = await upgradeConfidence(db, row.id, "corroborated", { annotationId: theirs });
    expect(up.confidence).toBe("corroborated");
    expect((up.provenance as Record<string, unknown>).corroborated_by).toBe(theirs);
  });
});

describe("supersede", () => {
  it("leaves a readable chain", async () => {
    const first = await insertAssertion(db, anchored({ subjectId: uuid(40), text: "v1" }));
    const second = await supersede(db, first.id, anchored({ subjectId: uuid(40), text: "v2" }));
    const third = await supersede(db, second.id, anchored({ subjectId: uuid(40), text: "v3" }));

    const at = async (id: string) => (await db.select().from(assertions).where(eq(assertions.id, id)))[0];
    const one = await at(first.id);
    expect(one.status).toBe("superseded");
    expect(one.supersededBy).toBe(second.id);
    const two = await at(one.supersededBy!);
    expect(two.supersededBy).toBe(third.id);
    expect((await at(two.supersededBy!)).status).toBe("active");
  });

  it("leaves the old row active when the new one fails its quote check", async () => {
    const first = await insertAssertion(db, anchored({ subjectId: uuid(41), text: "keeps" }));
    const before = await db.select({ id: assertions.id }).from(assertions);
    await expect(
      supersede(db, first.id, anchored({ subjectId: uuid(41), quote: "not in the text at all" })),
    ).rejects.toBeInstanceOf(QuoteMismatch);
    const [after] = await db.select().from(assertions).where(eq(assertions.id, first.id));
    expect(after.status).toBe("active");
    expect(after.supersededBy).toBeNull();
    expect(await db.select({ id: assertions.id }).from(assertions)).toHaveLength(before.length);
  });

  it("exports nothing that deletes", async () => {
    const mod = await import("./ledger");
    const names = Object.keys(mod);
    expect(names.some((n) => /delete|remove|purge|drop/i.test(n))).toBe(false);
    const src = (await import("node:fs")).readFileSync(
      (await import("node:path")).join(process.cwd(), "src", "harness", "ledger.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/delete\s+from/i);
  });
});

describe("not_stated", () => {
  it("is a row with a facet, no selectors and no vector", async () => {
    const row = await insertAssertion(db, {
      subjectType: "idea",
      subjectId: uuid(50),
      facet: "mechanism.revenue",
      text: "not_stated",
      sourceType: "abstract",
      provenance: { kind: "document", document_id: uuid(1) },
    });
    expect(row.text).toBe("not_stated");
    expect(row.confidence).toBe("extracted");
    expect(row.embedding).toBeNull();
    expect(row.abstractionLevel).toBeNull();
  });

  it("is refused an embedding", async () => {
    await expect(
      insertAssertion(db, {
        subjectType: "idea",
        subjectId: uuid(51),
        facet: "mechanism.revenue",
        text: "not_stated",
        sourceType: "abstract",
        provenance: { kind: "document", document_id: uuid(1) },
        embedding: new Array(EMBEDDING_DIMENSIONS).fill(0),
        embeddingModel: "voyage-3.5",
      }),
    ).rejects.toBeInstanceOf(QuoteMismatch);
  });
});

describe("recordJudgment", () => {
  async function aResult() {
    const [row] = await db
      .insert(matchResults)
      .values({
        edgeType: "mentor",
        querySubjectType: "person",
        querySubjectId: uuid(60),
        candidateSubjectId: uuid(61),
        score: 0.5,
        rank: 0,
        components: { sim_abs: 0.5, sim_spec: 0, sim_mech: 0, sim_domain: 0, sim_evidence: 0, contributors: {} },
        assertionSetHash: "deadbeef",
      })
      .returning();
    return row;
  }

  it("throws on an unknown edge type before any query runs", async () => {
    await expect(
      recordJudgment(db, {
        readerId: uuid(60),
        edgeType: "pen_pal",
        queryAssertionId: uuid(0),
        candidateSubjectId: uuid(61),
        candidateAssertionIds: [],
        matchResultId: uuid(0),
        rank: 0,
        verdict: "requested",
      }),
    ).rejects.toThrow();
  });

  it("stamps exposure on the result it was made against", async () => {
    const result = await aResult();
    const query = await insertAssertion(db, anchored({ subjectId: uuid(60) }));
    expect(result.shownAt).toBeNull();
    const j = await recordJudgment(db, {
      readerId: uuid(60),
      edgeType: "mentor",
      queryAssertionId: query.id,
      candidateSubjectId: uuid(61),
      candidateAssertionIds: [],
      matchResultId: result.id,
      rank: 0,
      verdict: "requested",
    });
    const [after] = await db.select().from(matchResults).where(eq(matchResults.id, result.id));
    expect(after.shownAt).toEqual(j.createdAt);
  });
});

describe("identity", () => {
  it("folds the email case", async () => {
    const first = await ensurePerson(db, { name: "Ada", email: "a@b.edu" });
    const second = await ensurePerson(db, { name: "Ada L", email: "A@B.EDU" });
    expect(second).toBe(first);
    const rows = await db.select().from(person).where(eq(person.email, "a@b.edu"));
    expect(rows).toHaveLength(1);
  });

  it("links two sessions of one person", async () => {
    const personId = await ensurePerson(db, { name: "Grace", email: "g@b.edu" });
    const one = await createSession(db);
    const two = await createSession(db);
    await linkSession(db, one, personId);
    await linkSession(db, two, personId);
    const rows = await db.select().from(session).where(eq(session.personId, personId));
    expect(rows).toHaveLength(2);
  });

  it("seeds the harness reader from the environment", async () => {
    process.env.HARNESS_READER_EMAIL = "reader@class.edu";
    process.env.HARNESS_READER_NAME = "The reader";
    const first = await readerPerson(db);
    expect(await readerPerson(db)).toBe(first);
    delete process.env.HARNESS_READER_EMAIL;
    delete process.env.HARNESS_READER_NAME;
  });
});

describe("the database refuses what ledger.ts refuses", () => {
  /** A raw statement, bypassing every check in `ledger.ts`. Drizzle wraps a
   *  driver error, so the constraint name is in the cause, not the message. */
  const exec = (statement: string) => db.execute(sql.raw(statement));

  async function refusal(statement: string): Promise<string> {
    try {
      await exec(statement);
    } catch (err) {
      const parts: string[] = [];
      for (let e: unknown = err; e instanceof Error; e = (e as { cause?: unknown }).cause) {
        parts.push(e.message, String((e as { constraint?: string }).constraint ?? ""));
      }
      return parts.join(" | ");
    }
    throw new Error(`expected a refusal, but the statement succeeded: ${statement.slice(0, 120)}`);
  }

  const insertAssertionSql = (columns: string, values: string) =>
    `insert into assertions (subject_type, subject_id, facet, text, source_type, provenance${columns}) ` +
    `values ('paper', 'x', 'purpose', 'some text', 'abstract', '{"kind":"document","document_id":"d"}'::jsonb${values})`;

  it("accepts the baseline row", async () => {
    await expect(exec(insertAssertionSql("", ""))).resolves.toBeTruthy();
  });

  it("rejects selectors that do not travel together", async () => {
    expect(await refusal(insertAssertionSql(", text_hash, quote", `, ${lit(textHash)}, null`))).toMatch(
      /selectors_with_text/,
    );
  });

  it("rejects a null facet outside an annotation", async () => {
    expect(
      await refusal(
        `insert into assertions (subject_type, subject_id, facet, text, source_type, provenance) values ('paper', 'x', null, 't', 'abstract', '{}'::jsonb)`,
      ),
    ).toMatch(/facet_null_only_annotation/);
  });

  it("rejects confirmed from an abstract", async () => {
    expect(await refusal(insertAssertionSql(", confidence", ", 'confirmed'"))).toMatch(/confirmed_is_human/);
  });

  it("rejects corroborated without a named source", async () => {
    expect(
      await refusal(
        `insert into assertions (subject_type, subject_id, facet, text, source_type, provenance, confidence) values ('person', 'x', 'purpose', 't', 'annotation', '{"kind":"annotation","annotation_id":"a"}'::jsonb, 'corroborated')`,
      ),
    ).toMatch(/corroborated_names_source/);
  });

  it("rejects an embedding with no model", async () => {
    const vec = `'[${new Array(EMBEDDING_DIMENSIONS).fill(0).join(",")}]'::vector`;
    expect(await refusal(insertAssertionSql(", embedding", `, ${vec}`))).toMatch(/embedding_has_model/);
  });

  it("rejects a facet outside the vocabulary", async () => {
    expect(
      await refusal(
        `insert into assertions (subject_type, subject_id, facet, text, source_type, provenance) values ('paper', 'x', 'vibe', 't', 'abstract', '{}'::jsonb)`,
      ),
    ).toMatch(/vibe/);
  });

  it("rejects a note annotation with no note", async () => {
    const [rs] = await db
      .insert(readingSessions)
      .values({ readerId: uuid(99), artifactId: uuid(1), textHash, mode: "casual" })
      .returning({ id: readingSessions.id });
    expect(
      await refusal(
        `insert into annotations (session_id, text_hash, start_off, end_off, quote, tag) values ('${rs.id}', ${lit(textHash)}, 0, 4, 'The ', 'note')`,
      ),
    ).toMatch(/note_required/);
  });

  it("rejects a second run at the same key", async () => {
    const statement = `insert into extraction_runs (text_hash, variant, prompt_version, core_version, model, attempt) values (${lit(textHash)}, 'abstract', 'pv', 'cv', 'm', 1)`;
    await expect(exec(statement)).resolves.toBeTruthy();
    expect(await refusal(statement)).toMatch(/extraction_runs_key/);
  });

  it("rejects a judgment with no query assertion or no result", async () => {
    expect(
      await refusal(
        `insert into judgments (reader_id, edge_type, candidate_subject_id, candidate_assertion_ids, match_result_id, rank, verdict) values ('r', 'mentor', 'c', '{}'::uuid[], '${uuid(1)}', 0, 'requested')`,
      ),
    ).toMatch(/query_assertion_id/);
  });
});

function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
