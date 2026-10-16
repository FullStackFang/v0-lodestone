/** The eval set: twenty firms cards and ten cross-field cards. The firms
 *  cards are the same twenty `fang-` firms the threshold retune sampled
 *  (`thresholds.md`); every card is filed as a `forge-idea/4`
 *  documents under ids of their own, so a run never collides with a seeded
 *  `--set firms` card and an id never moves when `firms.ts` is reordered.
 *
 *  `field` is the OpenAlex field of the idea's own domain: a mark whose
 *  paper sits in another field is a cross-field mark. */
import { createHash } from "node:crypto";
import { forgeDocument } from "../cohort";
import { FIRMS } from "../firms";
import { CROSS_CARDS } from "./cross";

export interface EvalCard {
  slug: string;
  ideaId: string;
  field: string;
  name: string;
  email: string;
  doc: Record<string, unknown>;
}

/** Firm slug → the OpenAlex field its idea belongs to. Education and
 *  criminology sit under Social Sciences in OpenAlex. */
const FIELDS: Record<string, string> = {
  pulse: "Health Professions",
  fold: "Social Sciences",
  shelf: "Business, Management and Accounting",
  kiln: "Business, Management and Accounting",
  hive: "Social Sciences",
  loop: "Social Sciences",
  ward: "Social Sciences",
  beacon: "Engineering",
  meter: "Energy",
  pantry: "Business, Management and Accounting",
  forage: "Environmental Science",
  sprout: "Social Sciences",
  scribe: "Social Sciences",
  tutor: "Social Sciences",
  lingo: "Social Sciences",
  split: "Economics, Econometrics and Finance",
  vault: "Computer Science",
  ledger: "Business, Management and Accounting",
  cart: "Business, Management and Accounting",
  route: "Business, Management and Accounting",
};

/** A uuid from the slug alone, in the form Whetstone mints. */
export function evalIdeaId(slug: string): string {
  const h = createHash("sha256").update(`lodestone-eval:${slug}`, "utf8").digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const FIRM_CARDS: EvalCard[] = Object.entries(FIELDS).map(([slug, field]) => {
  const firm = FIRMS.find((f) => f.title === `fang-${slug}`);
  if (!firm) throw new Error(`no firm fang-${slug}`);
  const ideaId = evalIdeaId(slug);
  const email = firm.email.replace("@", "+eval@");
  return {
    slug,
    ideaId,
    field,
    name: firm.name,
    email,
    doc: { ...forgeDocument({ ...firm, ideaId, email }), format: "forge-idea/4", already_have: [] },
  };
});

/** The ten cross-field cards (`cross.ts`), filed the same way. */
const CROSS: EvalCard[] = CROSS_CARDS.map((c) => {
  const ideaId = evalIdeaId(c.slug);
  const email = `${c.slug}@eval.test`;
  const member = {
    name: c.founder,
    email,
    ideaId,
    title: c.slug,
    line: c.line,
    said: c.said,
    entries: Object.entries(c.blocks).map(([block, text]) => ({ block, text })),
  };
  return { slug: c.slug, ideaId, field: c.field, name: c.founder, email, doc: { ...forgeDocument(member), format: "forge-idea/4", already_have: [] } };
});

export const EVAL_CARDS: EvalCard[] = [...FIRM_CARDS, ...CROSS];
