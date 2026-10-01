/** The gates. One pure function per stage over the card's fields; the
 *  stage is whichever comes first in STAGES and fails. The model proposes a
 *  verdict every turn and these decide — a prose claim cannot advance.
 *
 *  Each gate names the field it failed on so the failure is a question the
 *  next turn can ask, not a wall. */
import type { CardFields } from "@/schema/card";
import { RubricScores } from "@/schema/card";
import { STAGES, type CardStatus, type Stage } from "./stages";

export interface GateVerdict {
  pass: boolean;
  reason: string;
}

const pass: GateVerdict = { pass: true, reason: "" };
const fail = (reason: string): GateVerdict => ({ pass: false, reason });

function filled(s: string | null | undefined): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

/** Words that, alone, name nobody and nothing. A field made only of these
 *  (plus stopwords) is laundering, not a thesis. Short on purpose: the model
 *  is the judge, this is the floor. */
export const VAGUE_WORDS = [
  "everyone",
  "everybody",
  "anyone",
  "people",
  "users",
  "customers",
  "consumers",
  "businesses",
  "small businesses",
  "smbs",
  "companies",
  "enterprises",
  "platform",
  "solution",
  "app",
  "tool",
  "product",
  "service",
  "better",
  "easier",
  "faster",
  "save time",
  "saves time",
  "save money",
  "saves money",
];

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "for", "to", "of", "in", "on", "with", "that",
  "who", "which", "their", "its", "all", "any", "some", "more", "very", "really",
  "helps", "help", "helping", "make", "makes", "making", "them", "they", "it", "is",
  "are", "be", "by", "at", "from", "as", "this", "our", "your", "you", "we", "us",
  "ai", "powered", "based", "using", "use", "uses", "new", "modern", "smart",
]);

/** True when the text says nothing specific: every remaining token after
 *  stripping vague phrases is a stopword. */
export function isVague(text: string): boolean {
  let t = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  t = t.replace(VAGUE_PATTERN, " ");
  const tokens = t.split(/\s+/).filter(Boolean);
  return tokens.every((w) => STOPWORDS.has(w));
}

/** Longest phrase first so "small businesses" goes before "businesses";
 *  word-bounded so "app" never eats "apply". */
const VAGUE_PATTERN = new RegExp(
  `\\b(?:${[...VAGUE_WORDS]
    .sort((a, b) => b.length - a.length)
    .map((p) => p.replace(/\s+/g, "\\s+"))
    .join("|")})\\b`,
  "g",
);

export const gates: Record<Stage, (c: CardFields) => GateVerdict> = {
  intake(c) {
    return filled(c.idea_text) ? pass : fail("idea_text: nothing to work from yet");
  },

  thesis(c) {
    if (!filled(c.offering)) return fail("offering: missing");
    if (isVague(c.offering)) return fail("offering: too vague to be a thing someone could build");
    const seg = c.segment?.description;
    if (!filled(seg)) return fail("segment.description: missing");
    if (isVague(seg)) return fail(`segment.description: "${seg}" names no one in particular`);
    if (!filled(c.value_proposition)) return fail("value_proposition: missing");
    if (isVague(c.value_proposition)) return fail("value_proposition: a benefit, in the customer's words, with a magnitude");
    return pass;
  },

  segment(c) {
    const t = c.segment?.four_question_test;
    if (!t) return fail("segment.four_question_test: not yet run");
    const answers = [t.list_100_prospects, t.share_top_need, t.one_gtm_reaches, t.can_afford];
    const yes = answers.filter((a) => a === "yes").length;
    const maybe = answers.filter((a) => a === "maybe").length;
    if (yes === 4) return pass;
    if (yes === 3 && maybe === 1) {
      return filled(c.segment?.refinement)
        ? pass
        : fail("segment.refinement: three yes and a maybe needs a refinement that turns the maybe");
    }
    return fail(`segment.four_question_test: ${yes} yes, ${maybe} maybe — needs 4 yes, or 3 yes + 1 maybe with a refinement`);
  },

  jtbd(c) {
    const j = c.jtbd;
    if (!filled(j?.job_statement)) return fail("jtbd.job_statement: missing");
    if (!filled(j?.current_workaround)) return fail("jtbd.current_workaround: what they do today");
    if (j?.passes_member_test !== true) return fail("jtbd.passes_member_test: would a segment member say yes to the value proposition?");
    return pass;
  },

  buyer(c) {
    const b = c.economic_buyer;
    if (!filled(b?.role)) return fail("economic_buyer.role: who signs");
    if (b.role.trim().toLowerCase() === "unknown") {
      return typeof b.distinct_from_end_user === "boolean"
        ? pass
        : fail("economic_buyer.distinct_from_end_user: unknown buyer is allowed, but say whether it is the end user");
    }
    return filled(b.budget_evidence) ? pass : fail("economic_buyer.budget_evidence: a budget line, a past purchase, or flag the buyer unknown");
  },

  rubric(c) {
    if (!c.rubric_scores) return fail("rubric_scores: not yet scored");
    const r = RubricScores.safeParse(c.rubric_scores);
    return r.success ? pass : fail("rubric_scores: all eight factors, each with score, confidence, rationale and evidence type");
  },

  kill(c) {
    const k = c.kill_assumption;
    if (!filled(k?.assumption)) return fail("kill_assumption.assumption: the one assumption that, if wrong, kills it");
    if (k.falsifiable !== true) return fail("kill_assumption.falsifiable: must be a claim a result could disprove");
    const t = k.cheapest_test;
    if (!filled(t?.description)) return fail("kill_assumption.cheapest_test.description: missing");
    if (typeof t.days !== "number") return fail("kill_assumption.cheapest_test.days: how long the test takes");
    if (t.days > 14) return fail(`kill_assumption.cheapest_test.days: ${t.days} — the test must fit in two weeks`);
    if (!filled(t.kill_criterion)) return fail("kill_assumption.cheapest_test.kill_criterion: what result kills the thesis");
    return pass;
  },

  render(c) {
    for (const s of STAGES) {
      if (s === "render") break;
      const v = gates[s](c);
      if (!v.pass) return fail(`${s} gate open: ${v.reason}`);
    }
    return pass;
  },
};

/** The first stage whose gate fails; `render` when none does. */
export function deriveStage(c: CardFields): Stage {
  for (const s of STAGES) if (!gates[s](c).pass) return s;
  return "render";
}

/** Draft until the thesis gate passes; gated until every gate does. */
export function statusFor(c: CardFields): CardStatus {
  if (gates.render(c).pass) return "complete";
  if (gates.intake(c).pass && gates.thesis(c).pass) return "gated";
  return "draft";
}

/** Every stage's verdict at once — for the progress indicator and the card
 *  page's draft banner. */
export function verdicts(c: CardFields): Record<Stage, GateVerdict> {
  return Object.fromEntries(STAGES.map((s) => [s, gates[s](c)])) as Record<Stage, GateVerdict>;
}
