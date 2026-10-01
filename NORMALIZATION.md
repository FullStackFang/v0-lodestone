# Normalization

The canonical text of an artifact is the one reading of record that every
human highlight and every model quote indexes into. There is exactly one, it
is hashed, and the hash is the key the whole harness joins on.

**This file may never change silently — a change is a new `parser` name and a
new artifact version, never an edit in place.** A canonical text that shifts
under a stored offset turns every annotation over it into a lie, and the lie
is undetectable because the offsets still parse.

## The rule

`normalize(text)` in `src/harness/canonical.ts` applies, in this order, and
nothing else:

1. Unicode **NFC**.
2. Remove **U+200B** (zero-width space), **U+00AD** (soft hyphen) and
   **U+FEFF** (byte-order mark).
3. Collapse every run of whitespace — the JavaScript `\s` set, which includes
   `\n`, `\r`, `\t` and the Unicode spaces — to a single **U+0020**.
4. Strip leading and trailing whitespace.

`hashText(text)` is the lowercase hex **sha256 of the UTF-8 bytes** of the
normalized text.

The order matters. NFC first, because a combining sequence normalized after
the invisibles are stripped can compose differently. Whitespace last, because
a removed soft hyphen may leave two spaces adjacent.

`normalize` is idempotent: `normalize(normalize(t)) === normalize(t)`.

## Offsets are UTF-16 code units

Every `start_off` / `end_off` in the harness — on `assertions`, on
`annotations`, in an `ExtractionOutput` anchor — is an index into the
canonical text **as a JavaScript string**. That is UTF-16 code units: the
unit of `String.prototype.slice`, of DOM `Range` offsets, and of
`window.getSelection()`. A highlight made in the browser and a quote anchored
in Node agree on it without conversion.

**No SQL statement in the harness may apply `substr`, `left`, `right` or
`char_length` to a canonical text.** Postgres counts *code points*. The two
units agree on every character in the Basic Multilingual Plane and disagree
on every astral one — an emoji, a CJK Extension B ideograph, a musical
symbol — each of which is one code point and two UTF-16 code units. A single
emoji anywhere before a span shifts every Postgres offset after it by one,
silently, and the quote check would then pass in TypeScript and fail in SQL
for the same row.

So the canonical text is loaded whole and sliced in TypeScript. It is not a
large column and the harness is not a hot path; correctness is worth the
round trip. `evals/harness/canonical/fixture.json` carries an astral
character before its recorded span to keep the difference in a test rather
than in a bug report, and `canonical.test.ts` greps `src/harness/**` and
`src/app/**` for the four forbidden functions.

## What is *not* normalized

- **Case.** A quote is verbatim.
- **Punctuation, quotes, dashes.** A curly apostrophe stays curly; NFC does
  not fold it and neither do we.
- **Ligatures and compatibility forms.** NFC, not NFKC: `ﬁ` stays one
  character, because a PDF extractor that emits it and a reader who highlights
  it must land on the same offsets.
- **Hyphenation across a line break.** A hard hyphen is a character in the
  text. Only the *soft* hyphen (U+00AD), which is a rendering hint and not
  content, is removed.

## Separators the harness adds

`putArtifactText` normalizes whatever it is handed. A caller that joins
several pieces into one text — the conversation adapter joining a history
window of turns — must join with a separator normalization does not collapse.
The harness uses ` ¶ ` (space, U+00B6, space) for that, so segment boundaries
survive into the canonical text and an assertion's offsets can be tested
against the segment it came from.
