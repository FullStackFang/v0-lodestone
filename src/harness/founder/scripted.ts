/** A model that answers from a script.
 *
 * Not a recording of a real run — nothing here claims a real model ever
 * said this. It is a fixed instrument: the same window in, the same
 * assertions out, so a test of the adapter's *rules* (which turn owns a
 * quote, whose subject a facet is, when a repeat is a repeat) is not also a
 * test of a model's mood. The quotes must be verbatim spans of the text, or
 * the contract's anchor drops them and `stats.unanchored` says so — which
 * is itself worth a test.
 *
 * The seed script uses it under `VITEST=1` so twelve synthetic founders
 * seed identically every time and cost nothing.
 */
import type { StructuredFn } from "../model";
import type { ExtractionOutput } from "../schema";

export interface ScriptEntry {
  /** Matched against the text the extractor was given. */
  when: RegExp;
  output: ExtractionOutput;
}

const EMPTY: ExtractionOutput = { assertions: [], not_stated: [] };

/** First entry whose `when` matches the prompt wins; an unmatched prompt
 *  gets an empty extraction rather than a throw, so a script only has to
 *  cover what a test is about. */
export function scriptedStructured(entries: ScriptEntry[], model = "scripted"): StructuredFn {
  return (async (_schema, request) => {
    const entry = entries.find((e) => e.when.test(request.prompt));
    return {
      output: (entry?.output ?? EMPTY) as never,
      model,
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }) as StructuredFn;
}

/** An assertion for a script, with the two fields that are easy to get
 *  wrong defaulted: `prefix` empty (the quote begins the text) and
 *  `abstraction_level` specific, as the core expects from a variant. */
export function said(
  facet: ExtractionOutput["assertions"][number]["facet"],
  text: string,
  quote: string,
  over: Partial<ExtractionOutput["assertions"][number]> = {},
): ExtractionOutput["assertions"][number] {
  return {
    facet,
    abstraction_level: "specific",
    text,
    quote,
    prefix: "",
    subject: "idea",
    reason: "emphatic",
    ...over,
  };
}
