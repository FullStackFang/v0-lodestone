/** The card is the result.
 *
 * A rank is not an answer; a reader cannot act on 0.41. One `structured`
 * call per candidate turns a score into the only thing worth showing: the
 * correspondence between what the paper has and what the reader is missing,
 * and whether it is a move to make or an assumption to drop.
 *
 * Every candidate shown becomes a `match_results` row with `shown_at` set,
 * so a card that was rendered and never acted on is an implicit negative
 * later — and a card that was computed and never shown is not. */
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { artifactTexts, assertions, document, extractionRuns, matchResults } from "@/db/schema";
import { assertionSetHash } from "../ledger";
import { structured as realStructured } from "../model";
import type { EdgeType, MatchComponents, SubjectType } from "../schema";
import type { SubjectRef } from "../match/bandpass";
import type { AnalogyResult } from "./analogy";
import { citationLine, type PaperProvenance } from "./openalex";
import { harnessPrompt } from "./prompts";

export const PaperCard = z
  .object({
    mapping: z.string().min(1),
    verdict: z.enum(["generative", "critical"]),
    why: z.string().min(1),
  })
  .loose();
export type PaperCard = z.infer<typeof PaperCard>;

export interface PaperSummary {
  artifactId: string;
  title: string;
  citation: string;
  url: string | null;
  field: string | null;
  insight: string | null;
  purposes: string[];
  mechanisms: string[];
}

/** Everything a card needs about a paper, from rows already written — no
 *  second request to OpenAlex, ever. */
export async function paperSummary(db: Db, artifactId: string): Promise<PaperSummary> {
  const [text] = await db
    .select()
    .from(artifactTexts)
    .where(eq(artifactTexts.artifactId, artifactId))
    .orderBy(desc(artifactTexts.version))
    .limit(1);
  const [doc] = await db.select({ title: document.title }).from(document).where(eq(document.id, artifactId));
  const rows = await db
    .select({ facet: assertions.facet, text: assertions.text, level: assertions.abstractionLevel })
    .from(assertions)
    .where(eq(assertions.subjectId, artifactId));

  const provenance = (text?.provenance ?? {}) as PaperProvenance;
  const title = doc?.title ?? "Untitled";

  let insight: string | null = null;
  if (text) {
    const [run] = await db
      .select()
      .from(extractionRuns)
      .where(eq(extractionRuns.textHash, text.textHash))
      .orderBy(desc(extractionRuns.createdAt));
    const derived = run?.derived as { transferable_insight?: unknown } | null | undefined;
    if (typeof derived?.transferable_insight === "string") insight = derived.transferable_insight;
  }

  const live = rows.filter((row) => row.text !== "not_stated");
  return {
    artifactId,
    title,
    citation: citationLine(
      { ...provenance, authors: Array.isArray(provenance.authors) ? provenance.authors : [] },
      title,
    ),
    url: provenance.url ?? null,
    field: provenance.field ?? null,
    insight,
    purposes: live.filter((r) => r.facet === "purpose" && r.level === "specific").map((r) => r.text),
    mechanisms: live.filter((r) => r.facet?.startsWith("mechanism")).map((r) => r.text),
  };
}

export interface ShownResult {
  matchResultId: string;
  rank: number;
  score: number;
  source: AnalogyResult["source"];
  paper: PaperSummary;
  card: PaperCard | null;
  queryAssertionId: string | null;
  candidateAssertionIds: string[];
  components: AnalogyResult["components"];
}

export interface RerankDeps {
  structured?: typeof realStructured;
}

/** The text of a query row, for the prompt. */
async function queryText(db: Db, assertionId: string | null): Promise<string | null> {
  if (!assertionId) return null;
  const [row] = await db.select({ text: assertions.text }).from(assertions).where(eq(assertions.id, assertionId));
  return row?.text ?? null;
}

/**
 * Rerank the candidates and record every one shown.
 *
 * A failed call leaves the row without a card rather than dropping the
 * candidate: the exposure happened, and a missing card is a fact about the
 * model, not about the paper.
 */
export async function rerankAndShow(
  db: Db,
  input: {
    edgeType: EdgeType;
    query: SubjectRef;
    results: AnalogyResult[];
    /** Ridden into the judgment's context so a verdict knows its sitting. */
    sessionId?: string;
  },
  deps: RerankDeps = {},
): Promise<ShownResult[]> {
  const structured = deps.structured ?? realStructured;
  const prompt = harnessPrompt("rerank-paper");
  const model = process.env.HARNESS_RERANK_MODEL?.trim() || "claude-sonnet-5";

  const out: ShownResult[] = [];
  for (const [at, result] of input.results.entries()) {
    const rank = at + 1;
    const paper = await paperSummary(db, result.subjectId);
    const question = await queryText(db, result.queryAssertionId);

    let card: PaperCard | null = null;
    try {
      const response = await structured(PaperCard, {
        system: prompt.system,
        model,
        prompt: [
          `The reader is carrying this ${result.source === "constraint" ? "constraint" : "question"}:`,
          question ?? "(no question row — score alone put this here)",
          "",
          `The paper (${paper.field ?? "field unknown"}): ${paper.title}`,
          paper.purposes.length > 0 ? `Purposes: ${paper.purposes.join("; ")}` : "",
          paper.mechanisms.length > 0 ? `Mechanisms: ${paper.mechanisms.join("; ")}` : "",
          paper.insight ? `What it says that generalizes: ${paper.insight}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      });
      card = response.output;
    } catch {
      card = null;
    }

    const hash = await assertionSetHash(db, [input.query.subjectId, result.subjectId]);
    const [row] = await db
      .insert(matchResults)
      .values({
        edgeType: input.edgeType,
        querySubjectType: input.query.subjectType as SubjectType,
        querySubjectId: input.query.subjectId,
        candidateSubjectId: result.subjectId,
        score: result.score,
        rank,
        components: result.components as MatchComponents,
        card: card ? { ...card, source: result.source } : null,
        promptVersion: card ? prompt.promptVersion : null,
        assertionSetHash: hash,
        shownAt: new Date(),
      })
      .returning({ id: matchResults.id });

    out.push({
      matchResultId: row.id,
      rank,
      score: result.score,
      source: result.source,
      paper,
      card,
      queryAssertionId: result.queryAssertionId,
      candidateAssertionIds: result.candidateAssertionIds,
      components: result.components,
    });
  }
  return out;
}

/** Prior art is shown the same way and judged on its own edge, but no model
 *  is asked what it means: the card is the record. */
export async function showWithoutRerank(
  db: Db,
  input: { edgeType: EdgeType; query: SubjectRef; results: AnalogyResult[] },
): Promise<ShownResult[]> {
  const out: ShownResult[] = [];
  for (const [at, result] of input.results.entries()) {
    const rank = at + 1;
    const paper = await paperSummary(db, result.subjectId);
    const hash = await assertionSetHash(db, [input.query.subjectId, result.subjectId]);
    const [row] = await db
      .insert(matchResults)
      .values({
        edgeType: input.edgeType,
        querySubjectType: input.query.subjectType as SubjectType,
        querySubjectId: input.query.subjectId,
        candidateSubjectId: result.subjectId,
        score: result.score,
        rank,
        components: result.components as MatchComponents,
        card: null,
        promptVersion: null,
        assertionSetHash: hash,
        shownAt: new Date(),
      })
      .returning({ id: matchResults.id });

    out.push({
      matchResultId: row.id,
      rank,
      score: result.score,
      source: result.source,
      paper,
      card: null,
      queryAssertionId: result.queryAssertionId,
      candidateAssertionIds: result.candidateAssertionIds,
      components: result.components,
    });
  }
  return out;
}
