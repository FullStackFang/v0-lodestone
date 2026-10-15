/** The marked relevant documents, by card slug: for each, the papers a human
 *  says bear on the idea and the block each bears on. Marks are chosen by
 *  hand and never by the ranking under test. Patent marks go in
 *  `marks-patents.ts` once the patent source returns. */
import type { BLOCKS } from "../../../src/lodestone/cards";

export type BlockKey = (typeof BLOCKS)[number][0];

export interface EvalMark {
  source: "openalex" | "patent";
  /** A DOI or an OpenAlex `W…` id. */
  id: string;
  block: BlockKey;
}

export const MARKS: Record<string, EvalMark[]> = {};
