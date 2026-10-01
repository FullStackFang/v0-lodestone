# Eval results

Founder-bot (Haiku 4.5) against the engine. Full transcripts in `runs/`
(gitignored after the first commit; regenerate with `npm run eval -- <name>`).

## 2026-09-02 — engine `cli`, model `claude-opus-5`, effort `medium`

| scenario | turns to card | cap | gate disagreements | expectations | wall time |
| --- | --- | --- | --- | --- | --- |
| greenloop | **1** | 3 | 0 / 1 | all met | 76 s |
| thin | **3** | 4 | 0 / 3 | all met | 17 s + 29 s + 173 s |

**greenloop.** One turn: the pitch carried enough for every gate, so the model
filed all eleven groups — rubric and kill assumption included — and still
batched three questions (per-shop service cost, whether the pilots paid
unprompted, whether "more repeat visits" was measured). The rubric marked
segment size and margins as low-confidence inference. This is the two-beat
design working as intended on a rich pitch: the card is shareable
immediately, and the answers can re-open a gate if they contradict it.

**thin.** The regression the v0.3 pack failed. The first turn refused to
launder — *"Right now this is three placeholders stacked: 'small businesses,'
'an app,' and 'saves time.' … I'd rather ask than draft a vague version
you'd have to undo"* — and asked the three intake questions in one batch.
`extracted_fields` on that event holds `idea_text` only. Turn two filed the
thesis from the founder's specifics; turn three narrowed the segment on the
founder's own number (10+ recurring clients), left `can_afford` at `maybe`
with the Liscio price point as the refinement, and drafted the kill
assumption as a 14-day prepay test with a numeric kill criterion.

**Disagreement rate 0 / 4.** The model's `proposed_gate` matched the server's
verdict on every turn. No prompt changes were needed.

**Latency.** Opus 5 through the CLI ran 17–173 s per turn; the long turns are
the ones that draft the whole rubric (6–7 K output tokens). A Sonnet 5 smoke
of the same intake turn ran 31 s. `THESIS_MODEL=claude-sonnet-5` is the
knob if the thread feels slow; the eval numbers above are the Opus baseline.

## 2026-09-02 — engine `cli`, model `claude-opus-5`, effort `medium` — after `harness-founder`'s prompt edits

**Prompt version drift is expected and intended.** `intake.md`, `thesis.md`,
`schema.md`, `rubric.md` and `kill.md` all gained an ask, so every row above
was taken at a different `prompt_version` than every row below. The two are
not comparable turn-for-turn; this is the new baseline.

| scenario | turns to card | cap | gate disagreements | expectations | wall time |
| --- | --- | --- | --- | --- | --- |
| greenloop | **1** | 3 | 0 / 1 | all met | 138 s |

**greenloop.** Still one turn, and the two new expectations hold: the card
came back with a non-empty `evidence[]` (the four-cafe pilot and the ~$300/mo
saving, filed as observed behaviour rather than as a rubric rationale) and one
`founder_context.unfair_advantages` entry (five years of cafe-chain
operations). The reply's two follow-ups — did the pilots *pay*, and who eats
a lost cup's deposit — are the evidence ask doing its job: it asks what would
move a score from inference to evidence, which is the thing the card could
not previously record at all.

The turn is slower than the 76 s baseline (138 s). The prompt is longer by
five asks and the model filed two more field groups; a fair reading is that
the extra time bought the two groups. Worth watching rather than acting on.

The conversation adapter runs after each turn in the harness (awaited, not
scheduled), so this run also exercised `extractFromEvent` end to end.

## Not yet run

`tutormatch` (feature-list value proposition, E2) and `nurses` (end-user
trap, E3) are wired with expectations and have not been run live. Neither
has `thin` since the prompt edits — the row above it is from the previous
prompt version.
