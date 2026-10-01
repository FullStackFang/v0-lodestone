/** Placing a model's quote in the canonical text.
 *
 * Models mis-count offsets, so they are never asked for one; they are asked
 * for a quote and the five words before it, and the placing happens here
 * where it can be checked. A short quote — "the system" — anchored to its
 * first occurrence would corrupt token-level gold silently, so an
 * unplaceable quote is dropped and counted as `ambiguous`, which is a bench
 * number. A quote that does not occur at all is `unanchored`, which is a
 * different failure: the model invented it.
 *
 * Offsets out are UTF-16 code units into the text passed in. */

export type AnchorFailure = "ambiguous" | "unanchored";

export type AnchorResult =
  | { ok: true; start: number; end: number }
  | { ok: false; reason: AnchorFailure };

/** Every index at which `needle` occurs in `haystack`. */
function occurrences(haystack: string, needle: string): number[] {
  const at: number[] = [];
  if (!needle) return at;
  for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + 1)) at.push(i);
  return at;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The same words, tolerant of any whitespace between them — for a quote
 *  the model re-wrapped or a text whose canonical form collapsed a newline
 *  the model copied. */
function whitespaceTolerant(haystack: string, needle: string): number[] {
  const parts = needle.trim().split(/\s+/).map(escape);
  if (parts.length === 0) return [];
  const re = new RegExp(parts.join("\\s+"), "g");
  const at: number[] = [];
  for (let m = re.exec(haystack); m; m = re.exec(haystack)) {
    at.push(m.index);
    re.lastIndex = m.index + 1;
  }
  return at;
}

/** The end of a whitespace-tolerant match that starts at `start`. */
function tolerantEnd(haystack: string, needle: string, start: number): number {
  const parts = needle.trim().split(/\s+/).map(escape);
  const re = new RegExp(parts.join("\\s+"), "y");
  re.lastIndex = start;
  const m = re.exec(haystack);
  return m ? start + m[0].length : start + needle.length;
}

/**
 * Place `quote` in `text`, using `prefix` to disambiguate.
 *
 * In order: the prefix immediately followed by the quote (exactly, or across
 * any whitespace); the quote alone when it occurs exactly once; a
 * whitespace-tolerant match of the quote when *that* occurs exactly once.
 * Otherwise nothing, with the reason.
 */
export function anchor(text: string, quote: string, prefix?: string | null): AnchorResult {
  if (!quote) return { ok: false, reason: "unanchored" };

  const trimmedPrefix = (prefix ?? "").trim();
  if (trimmedPrefix) {
    // The prefix and the quote as one span: exact first, then across
    // whitespace, which is what a re-wrapped line looks like after
    // normalization.
    for (const joined of [`${trimmedPrefix} ${quote}`, `${trimmedPrefix}${quote}`]) {
      const at = occurrences(text, joined);
      if (at.length >= 1) {
        const start = at[0] + joined.length - quote.length;
        return { ok: true, start, end: start + quote.length };
      }
    }
    const tolerant = whitespaceTolerant(text, `${trimmedPrefix} ${quote}`);
    if (tolerant.length >= 1) {
      const end = tolerantEnd(text, `${trimmedPrefix} ${quote}`, tolerant[0]);
      // Walk back over the quote's own words to find where it starts.
      const quoteStarts = whitespaceTolerant(text.slice(tolerant[0], end), quote);
      if (quoteStarts.length >= 1) {
        const start = tolerant[0] + quoteStarts[quoteStarts.length - 1];
        return { ok: true, start, end };
      }
    }
  }

  const exact = occurrences(text, quote);
  if (exact.length === 1) return { ok: true, start: exact[0], end: exact[0] + quote.length };

  const tolerant = whitespaceTolerant(text, quote);
  if (exact.length === 0 && tolerant.length === 1) {
    return { ok: true, start: tolerant[0], end: tolerantEnd(text, quote, tolerant[0]) };
  }

  // It occurs — more than once — and the prefix did not settle which.
  if (exact.length > 1 || tolerant.length > 1) return { ok: false, reason: "ambiguous" };
  return { ok: false, reason: "unanchored" };
}
