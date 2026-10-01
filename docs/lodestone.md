# Lodestone — the campus idea network, as an MVP on thesis-forge

Built 2026-09-23 against `SUBMISSION-SPINE.md` at the repo root. The MVP is the wedge
plus one cohort: a student's Forge idea becomes a card on the server, the card is matched
to prior art before anyone else has published, a single cohort switches peers on, and a
director sees the map the cohort's cards make. No model is called server-side; the backend
stores, embeds once through Voyage, ranks and serves.

## What is here

| Surface | Route | Module |
| --- | --- | --- |
| Your cards and the import form | `/lodestone` | `src/lodestone/cards.ts` |
| A card: nine blocks, prior art, peers, publish | `/lodestone/cards/<ideaId>` | `priorArt.ts`, `peers.ts` |
| The director's cohort map | `/lodestone/map` (operators) | `map.ts`, `geometry.ts` |
| The weekly digest | `/lodestone/digest`, `npm run lodestone:digest` | `digest.ts` |

Storage is one new table, `forge_card` (migration `0011_lodestone_cards`): the export
document whole, owner, visibility `private | cohort`, `published_at`. The ledger rows
beneath a card are the ones `projectForgeIdea` files under `forge:<idea id>`, on the
owner's own person row, so a re-import supersedes and never duplicates. Paper abstracts
are embedded whole into `document_chunk.embedding`, the column the schema reserved.

Rules carried from Forge: `private` is the default and one action away; the cohort sees
the nine blocks with their origin marks and the owner's name, never the thread, the
evidence sentences or the run log; a revoked member's cards fall out of every list
without a write; the map counts and names regions and shows no grade.

## Run it

```bash
npm run lodestone:seed -- --me you@example.edu   # eight members, five papers, real vectors
npm run dev                                       # then sign in as you@example.edu
```

Sign-in is the magic link in `data/auth/outbox.jsonl` when no mail provider is set.
`--me` enrols that email as an operator member, which is what `/lodestone/map` checks
(or `PILOT_OPERATOR_EMAILS`). Import any `forge-idea/2` export from Forge on `/lodestone`.

`npm run lodestone:digest` renders every member's digest and hands it to the mail path
(the outbox in development). Both scripts open `data/pglite` and must not run while
`next dev` has it open.

`VOYAGE_API_KEY` in `.env.local` is what makes matching real. Without it cards are filed
with no vectors and every match list is empty and says so.

## Tests

`npx vitest run src/lodestone` — the geometry alone, and the network end to end on an
in-memory ledger with a hashed bag-of-words embedder (`test-embed.ts`). The paper
thresholds (`CLOSE` 0.75, `PAPER_FLOOR` 0.6) are tuned for Voyage and are lowered
explicitly in the test; what is under test is the mechanism.

## Not built, on purpose

Campus-wide tenancy, mutual introductions with contact reveal
(`founder-matching-consent` owns them), other card formats, Cornell corpus ingestion
beyond the seeded abstracts, and any lighter capture client. Regions come from k-means
over one blended vector per card, which on voyage-3.5 sits high across the board; the
profile bands are the Idea Atlas's and will want re-tuning once a real cohort exists.
