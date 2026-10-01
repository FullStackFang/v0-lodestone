/** The scripted model the synthetic seed runs on.
 *
 * It is not a recording and it is not clever: it reads the text it is given
 * and files one assertion per sentence by a fixed rule. That is enough,
 * because the seed exists to drive the *write path* — canonical text,
 * anchoring, subject clamping, repeat detection, embedding — and a real
 * model's judgment would make the bench's numbers move for reasons that are
 * not the change under test.
 *
 * Every quote is a verbatim sentence of the input, so nothing it emits is
 * dropped as unanchored. When a real run is wanted, unset `VITEST` and the
 * seed uses the engine.
 */
import type { StructuredFn } from "../model";
import type { ExtractionOutput } from "../schema";

type Assertion = ExtractionOutput["assertions"][number];

/** Sentences, kept verbatim so they anchor. The window's turn separator is
 *  trimmed off the front: a quote that reaches back across it belongs to
 *  the previous turn, and the adapter would rightly drop it. */
function sentences(text: string): string[] {
  return (
    text
      .match(/[^.!?]+[.!?]*/g)
      ?.map((s) => s.replace(/^[\s¶]+/, "").trim())
      .filter((s) => s.length > 3) ?? []
  );
}

/** Up to five words before a span, which is what the anchor wants. */
function prefixOf(text: string, quote: string): string {
  const at = text.indexOf(quote);
  if (at <= 0) return "";
  return text.slice(0, at).trim().split(/\s+/).slice(-5).join(" ");
}

const ACTION = /\b(ran|built|shipped|sold|taught|managed|closed|designed|recovered|spent|negotiated)\b/i;
const LACK = /\b(need|never|cannot|not an engineer|do not (know|have)|what i do not have)\b/i;
const COMMITMENT = /\b(full-time|free from|available|not looking|not available|advising only)\b/i;
const MONTH = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i;

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** `June 2028` → `2028-06`, the shape `available_from` takes. */
export function isoMonth(text: string): string | null {
  const m = MONTH.exec(text);
  if (!m) return null;
  const at = MONTHS.indexOf(m[1].toLowerCase());
  if (at < 0) return null;
  return `${m[2]}-${String(at + 1).padStart(2, "0")}`;
}

/** A resume: every sentence is a capability its owner commands. */
function fromResume(text: string): ExtractionOutput {
  const assertions: Assertion[] = sentences(text).map((quote) => ({
    facet: "mechanism_commanded",
    abstraction_level: "specific",
    text: quote.replace(/[.!?]+$/, "").toLowerCase(),
    quote,
    prefix: prefixOf(text, quote),
    subject: "person",
    reason: "emphatic",
  }));
  return { assertions, not_stated: [] };
}

/** A turn: the first sentence is what the idea is for; a first-person
 *  action with a number is evidence; a sentence about what they lack is a
 *  sought mechanism; a sentence about starting is the commitment. */
function fromTurn(text: string): ExtractionOutput {
  const parts = sentences(text);
  const assertions: Assertion[] = [];
  let commitment: { available_from: string | null; note: string } | undefined;

  parts.forEach((quote, at) => {
    const bare = quote.replace(/[.!?]+$/, "");
    const common = { abstraction_level: "specific" as const, quote, prefix: prefixOf(text, quote) };

    // The commitment line is checked first: a founder often answers "when
    // could you start" as the opening sentence of their last turn.
    if (COMMITMENT.test(quote)) {
      commitment = { available_from: isoMonth(quote), note: bare.toLowerCase() };
      assertions.push({ ...common, facet: "constraint", text: bare.toLowerCase(), subject: "person", reason: "emphatic" });
      return;
    }
    if (at === 0) {
      assertions.push({ ...common, facet: "purpose", text: bare.toLowerCase(), subject: "idea", reason: "emphatic" });
      return;
    }
    if (LACK.test(quote)) {
      assertions.push({ ...common, facet: "mechanism_sought", text: bare.toLowerCase(), subject: "person", reason: "emphatic" });
      return;
    }
    if (ACTION.test(quote)) {
      assertions.push({
        ...common,
        facet: /\d/.test(quote) ? "evidence" : "mechanism_commanded",
        text: bare.toLowerCase(),
        subject: "person",
        evidence_type: /\d/.test(quote) ? "observed_behavior" : undefined,
        reason: "emphatic",
      });
      return;
    }
  });

  return { assertions, not_stated: [], ...(commitment ? { derived: { commitment } } : {}) };
}

/** A resume reads as a resume; anything else is a conversation window. The
 *  two are told apart by the window's turn separator and by the resume's
 *  third-person bullets. */
export function syntheticScript(): StructuredFn {
  return (async (_schema, request) => {
    const text = request.prompt;
    const isResume = /^(Ran|Shipped|Built|Eight years|Six years|Civil engineer|Machine-learning|Power systems|Consultant|Founded|Taught|Practice manager)/.test(
      text.trim(),
    );
    return {
      output: (isResume ? fromResume(text) : fromTurn(text)) as never,
      model: "synthetic-script",
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }) as StructuredFn;
}
