/** The held-out fold is a function of the hash, not a list.
 *
 * A fixtures file naming held-out ids can be edited by the loop that is
 * supposed to be blind to it. This cannot: the fold falls out of the text's
 * own hash, so an artifact lands in fold 0 the moment it is ingested and
 * nothing can move it there or out of it.
 *
 * No bench takes a fold argument. `gold` and `vocab` read folds 1–4;
 * `final` reads fold 0, says so on stdout, and refuses to run twice for one
 * prompt version. */

export const FOLDS = 5;
/** The wall between the reader who makes the gold and the reader who edits
 *  the prompt. They are the same person. */
export const HELD_OUT = 0;

export function fold(textHash: string): number {
  return parseInt(textHash.slice(0, 8), 16) % FOLDS;
}

/** Folds 1–4 — everything the prompt loop is allowed to look at. */
export function isTraining(textHash: string): boolean {
  return fold(textHash) !== HELD_OUT;
}

/** Fold 0. Reading this is an event; the bench prints a line saying so. */
export function isHeldOut(textHash: string): boolean {
  return fold(textHash) === HELD_OUT;
}
