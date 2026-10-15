## Context

Five rules from `docs/next-steps.md` hold through every change: no model on
the server; private by default; the cohort sees blocks, never the thread; a
revoked member falls out without a write; the map shows no grade. Each
sub-change's design says how it keeps them. This document only sequences.

Reviewed 2026-10-15 by a second reader against the code; the order, the
gates and the shapes below are the post-review ones.

## The sequence and why

```
corpus-compact (in flight)
      │
      ▼
sources-repair §1 (OpenAlex key)
      │
      ├──► eval-set ──────────────────────────────────────────┐
      │                                                        │
      ├──► sources-repair §2 (BigQuery patents) ──► publish ───┤
      │                                                        │
      └──► publish §1–2 (roster, join, health, guards) ────────┘
                                                               │
                                                               ▼
                                         card-search ──► hit-sentences §2 ──► verdict-ranking §2
                                              ▲               ▲                      ▲
                 hit-sentences §1 (splitter, table) ──────────┘                      │
                 verdict-ranking §1, §3 (owner verdicts, graph table) ───────────────┘
```

1. **The OpenAlex key first** because the eval runner fetches a hundred or
   more single works and the keyless budget is ten cents a day shared with
   the whole IP. Half a day of work, and nothing downstream can be measured
   without it.
2. **eval-set next**, in parallel with the rest of sources-repair and the
   code half of publish. It touches no production path.
3. **publish before card-search** because search spends money per card and
   writes to the corpus; its first real run is the MVP cohort's first card.
4. **card-search before the thin half of hit-sentences and the pivot half of
   verdict-ranking**, which read what search writes. The sentence table and
   the owner-verdict CTEs do not, and can be built alongside search.
5. **The pivot diff last** because it reads `card_rank`, which search writes
   on completion.

Tracks that may run side by side, each with its own gate: eval-set §1
(authoring) with sources-repair; publish §1–2 with sources-repair §2;
hit-sentences §1 with card-search; verdict-ranking §1 and §3 with
card-search. The rule is that a change's *gate* is checked before the next
change that depends on it starts, not before any work starts.

## Gates

A gate is a check run after a change's tasks are all ticked and before any
dependent change's first task. Each is recorded in `tasks.md` here with
date and value. A gate that fails sends the work back to the change it
follows.

| After | Gate |
| --- | --- |
| corpus-compact | `npx vitest run` green; `priorArtFor` SQL and `scorePaper` agree on the seeded cohort; `GET /papers/<id>` returns `abstractHash` |
| sources-repair §1 | a keyed `--list` run of 20 DOIs with no shared-budget notice; limiter at 25/s under a key |
| eval-set | `baseline.md` committed from a `--no-search` run over marks plus distractors, with P@5, R@10, MRR, fields; the ten cross-field cards exist |
| sources-repair §2 | one BigQuery run of 100 patents, bytes processed and cost noted; `patentsview.ts` gone |
| publish | `/api/lodestone/health` all true on production and preview; owner signed in by Resend link; a membership-kind operator invited a second address, accepted, active; a token minted; Whetstone's connection test passes against the live URL |
| card-search | eval rows `search`, `quota`, `purpose` recorded; marked-document MRR ≥ baseline and mean distinct fields ≥ baseline + 1; one real card's `search.state` reaches `done` on production with `found > 0` and its provenance within the allowlist |
| hit-sentences | eval `sentences --no-search` row equals the previous `--no-search` row; every sentence on a live card is a substring of its abstract under the hit's `abstractHash`; count of thin documents in the production corpus noted |
| verdict-ranking | `--verdicts --no-search` run recorded: excluded hits gone, marked-document MRR on the ten not below; on production, a `not_relevant` disappears on re-read for the owner and is present for another member, one pivot shows `changes` naming the edited block, `paper_block_verdict` has rows and the map says "prior off" |

## Handshakes with Whetstone

Each Lodestone change writes its `docs/api.md` section as one of its tasks,
and that section is the only place the shape is stated for a client. The
paired Whetstone change's first coding task reads it; until it exists the
Whetstone change builds against a fixture copied from the Lodestone design
and says so in the fixture file.

| Lodestone | Whetstone | Shape |
| --- | --- | --- |
| card-search | forge-idea-purpose | `forge-idea/5`: `/4` plus `purpose: { l1, l2 } \| null`, other keys under `purpose` ignored; `POST` returns `search: "queued"`; `GET` returns `search: { state: "running" \| "done" \| "stale", finishedAt, sources, found, abstracted }`; a hit gains `blockKeys` |
| hit-sentences | forge-network-why | a hit gains `sentences: [{ text, block, cosine }]` (block is a key), `thin`, `abstractHash`; read endpoint gains `thin`, `abstractKind` |
| verdict-ranking | forge-pivot-diff | a hit gains `via: { useful }` for the owner only; `GET` gains `changes: { since, blocks, added, dropped[] with verdict } \| null`, null while `search.state` is `running` and for non-owners; `context.blockKeys` on a posted verdict |

## Definition of done

On the production deployment, with the owner and one invited member:

1. A member sends a card with a purpose; `search` runs to `done`; the panel
   shows hits with sentences; the top ten holds at least three distinct
   fields.
2. The member explains the hits in Whetstone and sees a why per hit; a thin
   hit, if the corpus holds one near the card, is marked low confidence.
3. The member gives three verdicts; the `not_relevant` one is gone on the
   next read; a neighbour of a `useful` one appears with `via`; the other
   member, reading the published card, sees neither effect.
4. The member rewrites one block, re-sends, and the panel shows what changed.
5. `paper_block_verdict` has rows; the map says the prior is off and how many
   ideas have verdicts.
6. The eval set's latest `--no-search` run is at or above baseline on
   marked-document MRR and at least one above it on fields.
7. The digest has run once by schedule and arrived.

When all seven hold, each sub-change is archived with `openspec archive`,
then this one.
