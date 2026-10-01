/** Fixed lines. A new blank thread opens on OPENING_LINE — never a model
 *  call, so the first thing a thread says is instant and identical every
 *  time. Stage labels are what the rail shows; the stage ids stay internal. */
import type { Stage } from "./stages";

export const OPENING_LINE =
  "What would you sell, and to whom? One or two sentences is enough — the card is drafted from your words, so say it the way you would to a customer.";

export const STAGE_LABELS: Record<Stage, string> = {
  intake: "Intake",
  thesis: "Thesis",
  segment: "Segment",
  jtbd: "Job to be done",
  buyer: "Buyer",
  rubric: "Rubric",
  kill: "Kill assumption",
  render: "Card",
};

/** The status line under the composer, from the model's own count. */
export function statusLine(questionsLeft: number | null, complete: boolean): string {
  if (complete) return "Card · ready";
  if (questionsLeft === null) return "Card · drafting";
  if (questionsLeft === 0) return "Card · drafting — nothing left to ask";
  return `Card · drafting — ${questionsLeft} question${questionsLeft === 1 ? "" : "s"} left`;
}
