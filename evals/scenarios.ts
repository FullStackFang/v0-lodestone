/** Founder-bot scenarios. Each is a persona (what the founder truly knows),
 *  a seed (their opening line), and expectations the harness checks after
 *  the run. Ported from the lab's `simulate.py` and `evals.md`; the
 *  expectations are what the pack got wrong or was never tested on. */
import type { CardFields } from "@/schema/card";
import type { StageEventRow } from "@/db/schema";

export interface Scenario {
  name: string;
  persona: string;
  seed: string;
  /** Turns to a complete card, at most. */
  maxTurns: number;
  /** Each returns a failure message or null. */
  expectations: ((run: RunSummary) => string | null)[];
}

export interface RunSummary {
  fields: CardFields;
  events: StageEventRow[];
  complete: boolean;
  turns: number;
}

const FOUNDER_RULES =
  "Answer the advisor concisely and realistically, first person, 1-3 sentences, like a real founder texting. " +
  "Don't dump everything at once, don't be a pushover. If you haven't decided something, give your best real " +
  "answer or say you're unsure. Output ONLY your next reply as the founder, nothing else.";

export const SCENARIOS: Record<string, Scenario> = {
  greenloop: {
    name: "greenloop",
    persona: `You are role-playing a startup FOUNDER talking to an advisor. Stay in character.

Your idea — GreenLoop: a $200/month subscription for independent coffee shops. It gives them branded returnable cups, a deposit-tracking app for customers, and weekly cup-washing pickup and dropoff. It cuts single-use cup spend and brings back eco-conscious regulars. You piloted it in 4 Portland cafes; each paid the $200 themselves, saved about $300/month on cups and saw repeat visits climb. You ran operations at a regional cafe chain for 5 years, so you know how cafe owners think about margin and foot traffic. You'd run the washing yourself at first with a van and one part-timer.

${FOUNDER_RULES}`,
    seed:
      "GreenLoop is a $200/mo subscription for independent coffee shops: branded returnable cups, a deposit app for customers, and weekly cup-washing pickup/dropoff. Cuts single-use cup cost and brings back eco regulars. Piloted in 4 Portland cafes, each saved ~$300/mo on cups with more repeat visits. I ran ops at a regional cafe chain for 5 years.",
    maxTurns: 3,
    expectations: [
      (r) => (r.complete ? null : "card did not complete"),
      (r) => (r.fields.rubric_scores ? null : "no rubric"),
      (r) =>
        r.fields.economic_buyer?.budget_evidence ? null : "pilot cafes paid — budget evidence should be filed",
      // The two asks the coach gained: the pilot is an action, and five years
      // of cafe operations is the advantage a newcomer does not have.
      (r) => ((r.fields.evidence ?? []).length > 0 ? null : "no evidence[] entry — the four-cafe pilot is an action"),
      (r) =>
        (r.fields.founder_context?.unfair_advantages ?? []).length > 0
          ? null
          : "no founder_context.unfair_advantages entry",
    ],
  },

  thin: {
    name: "thin",
    persona: `You are role-playing a startup FOUNDER talking to an advisor. Stay in character. You start VAGUE — you lead with the fuzzy version because you haven't practiced the pitch — but you have a real, concrete idea underneath and will give honest specifics when asked directly.

The truth underneath: you want to help solo bookkeepers and small accounting firms (1-5 people) stop losing hours every month manually chasing clients for receipts and bank statements at tax time. Your tool auto-requests missing documents from the client by text/email, nags on a schedule, and files what comes back into the right folder. You'd charge about $49/month per bookkeeper seat. You spent 6 years as a bookkeeper yourself and felt this pain every quarter. No pilot yet, no revenue — it's an idea you're serious about. You're unsure about pricing and whether firms or solo bookkeepers are the better first target.

When asked something specific, answer it honestly from the truth above; if it's something you genuinely haven't decided (like pricing or first target), say you're unsure and give your best guess. ${FOUNDER_RULES}`,
    seed: "I want to build an app that helps small businesses manage their finances better. It uses AI to save them time on bookkeeping.",
    maxTurns: 4,
    expectations: [
      (r) => {
        const first = r.events[0];
        const seg = (first?.extractedFields as { segment?: { description?: string | null } })?.segment?.description;
        return seg && /small business/i.test(seg) ? `first turn laundered a vague segment: "${seg}"` : null;
      },
      (r) => (r.complete ? null : "card did not complete"),
      (r) => (/bookkeep|account/i.test(r.fields.segment?.description ?? "") ? null : "segment never reached bookkeepers"),
    ],
  },

  tutormatch: {
    name: "tutormatch",
    persona: `You are role-playing a startup FOUNDER talking to an advisor. Stay in character.

Your idea — TutorMatch: a marketplace connecting parents with vetted math tutors, with video chat, scheduling, progress dashboards, and AI-generated practice problems. Your segment is parents of middle schoolers in the Boston suburbs who already spend $200+/mo on tutoring. Pressed on the one benefit, the honest answer is: parents can see, week by week, whether the tutoring is actually moving their kid's grade — today they pay for months with no idea. You have no pilot; you interviewed 12 parents and 9 said tracking progress was their biggest frustration. You were a math teacher for 4 years.

${FOUNDER_RULES}`,
    seed:
      "TutorMatch is a marketplace connecting parents with vetted math tutors. It has video chat, scheduling, progress dashboards, and AI-generated practice problems. Parents of middle schoolers in the Boston suburbs who spend $200+/mo on tutoring.",
    maxTurns: 4,
    expectations: [
      (r) => (r.complete ? null : "card did not complete"),
      (r) => {
        const vp = r.fields.value_proposition ?? "";
        return /video|scheduling|dashboard|ai-generated/i.test(vp) ? `value proposition is still a feature list: "${vp}"` : null;
      },
    ],
  },

  nurses: {
    name: "nurses",
    persona: `You are role-playing a startup FOUNDER talking to an advisor. Stay in character.

Your idea: a wellness app for hospital nurses to manage burnout — meditation, shift-aware sleep tracking, peer support groups. Nurses love it in interviews (you did 20). You plan to sell it to hospitals. Pressed on who at the hospital would pay, you honestly don't know — you assume HR or the chief nursing officer, and you have not spoken to either. You have no budget evidence. You are a former ICU nurse.

${FOUNDER_RULES}`,
    seed:
      "A wellness app for hospital nurses to manage burnout — meditation, shift-aware sleep tracking, peer support groups. Nurses love it in interviews. We'll sell it to hospitals.",
    maxTurns: 4,
    expectations: [
      (r) => (r.complete ? null : "card did not complete"),
      (r) => (r.fields.economic_buyer?.distinct_from_end_user === true ? null : "buyer not marked distinct from end user"),
      (r) => (/^nurse/i.test(r.fields.economic_buyer?.role ?? "") ? "the nurse was filed as the economic buyer" : null),
      (r) => {
        const b = r.fields.economic_buyer;
        const honest = b?.role?.toLowerCase() === "unknown" || (b?.budget_evidence ?? "").length > 0;
        return honest ? null : `buyer "${b?.role}" filed with no budget evidence and not marked unknown`;
      },
    ],
  },
};
