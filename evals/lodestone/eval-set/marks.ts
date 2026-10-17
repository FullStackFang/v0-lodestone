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
  /** The paper's OpenAlex field (its primary topic's), as fetched when marked. */
  field: string;
}

/** 2026-10-16: the firms cards' marks are Claude's "strong" and "ok" calls
 *  from the candidate review, not hand-ticked: the owner chose to let real
 *  use recalibrate them. The cross-field cards' marks are the papers each
 *  card was written against (`cross.ts`). */
export const MARKS: Record<string, EvalMark[]> = {
  pulse: [
    { source: "openalex", id: "W2973026242", block: "value_proposition", field: "Psychology" },
    { source: "openalex", id: "W4205508774", block: "value_proposition", field: "Psychology" },
    { source: "openalex", id: "W2561749168", block: "customer_segments", field: "Psychology" },
  ],
  fold: [
    { source: "openalex", id: "W2963067886", block: "value_proposition", field: "Social Sciences" },
    { source: "openalex", id: "W4389347673", block: "customer_segments", field: "Social Sciences" },
    { source: "openalex", id: "W2568401417", block: "value_proposition", field: "Social Sciences" },
  ],
  shelf: [
    { source: "openalex", id: "W2920777508", block: "value_proposition", field: "Business, Management and Accounting" },
    { source: "openalex", id: "W2558607323", block: "key_resources", field: "Business, Management and Accounting" },
  ],
  kiln: [
    { source: "openalex", id: "W2301369611", block: "value_proposition", field: "Arts and Humanities" },
    { source: "openalex", id: "W2541058589", block: "relationships", field: "Business, Management and Accounting" },
    { source: "openalex", id: "W3093817711", block: "channels", field: "Engineering" },
  ],
  hive: [
    { source: "openalex", id: "W2775542269", block: "key_activities", field: "Social Sciences" },
    { source: "openalex", id: "W2983543780", block: "value_proposition", field: "Computer Science" },
    { source: "openalex", id: "W4214811271", block: "value_proposition", field: "Social Sciences" },
  ],
  loop: [
    { source: "openalex", id: "W1992150652", block: "value_proposition", field: "Decision Sciences" },
    { source: "openalex", id: "W4413282654", block: "channels", field: "Social Sciences" },
    { source: "openalex", id: "W69062574", block: "value_proposition", field: "Decision Sciences" },
  ],
  ward: [
    { source: "openalex", id: "W4394597468", block: "key_resources", field: "Computer Science" },
    { source: "openalex", id: "W2962912345", block: "value_proposition", field: "Engineering" },
    { source: "openalex", id: "W4387266674", block: "value_proposition", field: "Engineering" },
  ],
  beacon: [
    { source: "openalex", id: "W3003603378", block: "key_resources", field: "Engineering" },
    { source: "openalex", id: "W1526379198", block: "key_activities", field: "Engineering" },
    { source: "openalex", id: "W4410400489", block: "value_proposition", field: "Engineering" },
    { source: "openalex", id: "W2964029185", block: "key_resources", field: "Engineering" },
  ],
  meter: [
    { source: "openalex", id: "W2800291496", block: "value_proposition", field: "Engineering" },
    { source: "openalex", id: "W1964264479", block: "value_proposition", field: "Computer Science" },
    { source: "openalex", id: "W3166464694", block: "customer_segments", field: "Environmental Science" },
  ],
  pantry: [
    { source: "openalex", id: "W2943039458", block: "value_proposition", field: "Business, Management and Accounting" },
    { source: "openalex", id: "W2809059267", block: "customer_segments", field: "Nursing" },
    { source: "openalex", id: "W4402926586", block: "customer_segments", field: "Nursing" },
  ],
  forage: [
    { source: "openalex", id: "W4282981913", block: "value_proposition", field: "Agricultural and Biological Sciences" },
    { source: "openalex", id: "W4389204742", block: "revenue_streams", field: "Agricultural and Biological Sciences" },
    { source: "openalex", id: "W4399812445", block: "customer_segments", field: "Agricultural and Biological Sciences" },
    { source: "openalex", id: "W4366748213", block: "channels", field: "Agricultural and Biological Sciences" },
  ],
  sprout: [
    { source: "openalex", id: "W2307942733", block: "customer_segments", field: "Health Professions" },
    { source: "openalex", id: "W2588732282", block: "customer_segments", field: "Health Professions" },
    { source: "openalex", id: "W3119516637", block: "customer_segments", field: "Health Professions" },
    { source: "openalex", id: "W4318476975", block: "key_activities", field: "Agricultural and Biological Sciences" },
    { source: "openalex", id: "W2084924967", block: "cost_structure", field: "Engineering" },
  ],
  scribe: [
    { source: "openalex", id: "W3136979662", block: "value_proposition", field: "Social Sciences" },
    { source: "openalex", id: "W1911466876", block: "customer_segments", field: "Social Sciences" },
  ],
  tutor: [
    { source: "openalex", id: "W7165850525", block: "relationships", field: "Social Sciences" },
    { source: "openalex", id: "W2961378765", block: "value_proposition", field: "Mathematics" },
    { source: "openalex", id: "W595866865", block: "value_proposition", field: "Social Sciences" },
    { source: "openalex", id: "W4406816944", block: "value_proposition", field: "Psychology" },
  ],
  lingo: [
    { source: "openalex", id: "W4409994649", block: "value_proposition", field: "Chemical Engineering" },
    { source: "openalex", id: "W7134139052", block: "value_proposition", field: "Health Professions" },
    { source: "openalex", id: "W2050201475", block: "customer_segments", field: "Chemical Engineering" },
  ],
  split: [
    { source: "openalex", id: "W4413163742", block: "customer_segments", field: "Social Sciences" },
    { source: "openalex", id: "W3113688461", block: "value_proposition", field: "Business, Management and Accounting" },
    { source: "openalex", id: "W4417003607", block: "value_proposition", field: "Computer Science" },
  ],
  vault: [
    { source: "openalex", id: "W4323545949", block: "customer_segments", field: "Computer Science" },
    { source: "openalex", id: "W4385234803", block: "customer_segments", field: "Computer Science" },
    { source: "openalex", id: "W2471998880", block: "value_proposition", field: "Computer Science" },
    { source: "openalex", id: "W4384696689", block: "value_proposition", field: "Computer Science" },
  ],
  ledger: [
    { source: "openalex", id: "W4411840570", block: "value_proposition", field: "Business, Management and Accounting" },
    { source: "openalex", id: "W3110947417", block: "customer_segments", field: "Business, Management and Accounting" },
    { source: "openalex", id: "W3084148495", block: "value_proposition", field: "Decision Sciences" },
  ],
  cart: [
    { source: "openalex", id: "W2941140606", block: "value_proposition", field: "Health Professions" },
    { source: "openalex", id: "W2227466887", block: "customer_segments", field: "Decision Sciences" },
    { source: "openalex", id: "W4410240862", block: "value_proposition", field: "Computer Science" },
    { source: "openalex", id: "W4409471007", block: "customer_segments", field: "Health Professions" },
  ],
  route: [
    { source: "openalex", id: "W3022623343", block: "value_proposition", field: "Engineering" },
    { source: "openalex", id: "W1571501474", block: "value_proposition", field: "Business, Management and Accounting" },
    { source: "openalex", id: "W3166743142", block: "revenue_streams", field: "Business, Management and Accounting" },
    { source: "openalex", id: "W4224011787", block: "key_activities", field: "Engineering" },
  ],
  swap: [
    { source: "openalex", id: "W4242907262", block: "value_proposition", field: "Medicine" },
    { source: "openalex", id: "W1995219873", block: "key_activities", field: "Economics, Econometrics and Finance" },
  ],
  nook: [
    { source: "openalex", id: "W1979654803", block: "key_activities", field: "Health Professions" },
    { source: "openalex", id: "W1988469459", block: "value_proposition", field: "Health Professions" },
  ],
  spin: [
    { source: "openalex", id: "W1999393241", block: "key_activities", field: "Engineering" },
    { source: "openalex", id: "W2944364052", block: "key_resources", field: "Engineering" },
  ],
  preflight: [
    { source: "openalex", id: "W2119472226", block: "value_proposition", field: "Health Professions" },
    { source: "openalex", id: "W2166258422", block: "value_proposition", field: "Health Professions" },
  ],
  dawn: [
    { source: "openalex", id: "W2318249357", block: "value_proposition", field: "Psychology" },
    { source: "openalex", id: "W2903703577", block: "value_proposition", field: "Psychology" },
  ],
  slice: [
    { source: "openalex", id: "W2130960228", block: "key_activities", field: "Business, Management and Accounting" },
    { source: "openalex", id: "W3122167207", block: "key_activities", field: "Business, Management and Accounting" },
  ],
  hush: [
    { source: "openalex", id: "W2160540074", block: "value_proposition", field: "Health Professions" },
    { source: "openalex", id: "W1999401028", block: "value_proposition", field: "Health Professions" },
  ],
  tumbler: [
    { source: "openalex", id: "W2792696497", block: "value_proposition", field: "Environmental Science" },
    { source: "openalex", id: "W617621853", block: "key_activities", field: "Environmental Science" },
  ],
  chill: [
    { source: "openalex", id: "W1998110148", block: "key_resources", field: "Agricultural and Biological Sciences" },
    { source: "openalex", id: "W2876758168", block: "key_activities", field: "Agricultural and Biological Sciences" },
  ],
  movein: [
    { source: "openalex", id: "W2132505539", block: "key_activities", field: "Engineering" },
    { source: "openalex", id: "W2089584121", block: "value_proposition", field: "Engineering" },
  ],
};
