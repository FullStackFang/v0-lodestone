/** The eight stages, in order. The kickoff's vocabulary, not the pack's:
 *  the pack's DISCONFIRM is `kill` here and its buying-centre half of SEGMENT
 *  is `buyer`; CANVAS and EVIDENCE are opt-in pack material outside the MVP.
 *
 *  A stage is never stored. `deriveStage` in gates.ts walks this list and
 *  returns the first whose gate fails. */
export const STAGES = [
  "intake",
  "thesis",
  "segment",
  "jtbd",
  "buyer",
  "rubric",
  "kill",
  "render",
] as const;

export type Stage = (typeof STAGES)[number];

export const CARD_STATUSES = ["draft", "gated", "complete"] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage);
}
