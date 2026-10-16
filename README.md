# Lodestone

The campus idea network. A student's idea becomes a card on the server, the card is
matched to prior art and to peers before anyone else has published, one cohort switches
peers on, and a director sees the map the cohort's cards make. No model is called on
the server: the backend stores, embeds once through Voyage, ranks and serves.

Lodestone began as a closure of Thesis Forge and keeps that app's ledger, auth and
membership code. The authoring tool is Forge, a separate desktop app; Lodestone
consumes its `forge-idea` export.

## Run it

```bash
npm install
cp .env.example .env.local                        # VOYAGE_API_KEY makes matching real
npm run lodestone:seed -- --me you@example.edu    # eight members, five papers, real vectors
npm run lodestone:seed -- --me you@example.edu --set firms   # or 24 fictional "fang-" firms, 15 papers
npm run dev                                       # http://localhost:3010; kills whatever held the port first (PORT= to change), PGlite under ./data/
npm test                                          # vitest, in-memory PGlite, fake embedder
npm run typecheck
```

Sign-in is the magic link written to `data/auth/outbox.jsonl` when no mail provider is
set. `--me` enrols that email as an operator member, which is what `/lodestone/map`
checks (or `PILOT_OPERATOR_EMAILS`). Import any `forge-idea` export on `/lodestone`.

`npm run lodestone:digest` renders every member's digest and hands it to the mail path.
Both scripts open `data/pglite` directly and must not run while `next dev` has it open.

Without `VOYAGE_API_KEY` cards are filed with no vectors and every match list is empty
and says so.

## What is here

| Surface | Route | Module |
| --- | --- | --- |
| Your cards and the import form | `/lodestone` | `src/lodestone/cards.ts` |
| A card: nine blocks, prior art, peers, publish | `/lodestone/cards/<ideaId>` | `priorArt.ts`, `peers.ts` |
| The field around a card: peers and prior art placed by closeness | `/lodestone/cards/<ideaId>/field` | `field.ts` |
| The director's cohort map | `/lodestone/map` (operators) | `map.ts`, `geometry.ts` |
| The weekly digest | `/lodestone/digest`, `npm run lodestone:digest` | `digest.ts` |
| API tokens for a client such as Whetstone | `/lodestone/tokens` | `api.ts` |
| The client API: send a card, read its matches, post a verdict | `/api/lodestone/*`, see `docs/api.md` | `api.ts`, `src/app/api/lodestone/` |

Storage is three tables of Lodestone's own: `forge_card` (migration `0011`), the export
document whole, owner, visibility `private | cohort`, `published_at`. The ledger rows
beneath a card are the ones `projectForgeIdea` files under `forge:<idea id>` on the
owner's own person row, so a re-import supersedes and never duplicates. Paper abstracts
are embedded whole into `document_chunk.embedding`. `api_token` and `card_feedback`
(migration `0012`) hold a member's client tokens, sha256 only, and their verdicts on the
matches a client showed them.

Rules carried from Forge: `private` is the default and one action away; the cohort sees
the nine blocks with their origin marks and the owner's name, never the thread, the
evidence sentences or the run log; a revoked member's cards fall out of every list
without a write; the map counts and names regions and shows no grade.

## Database

Migrations live in `./drizzle`. `npm run db:generate` after editing a schema file under
`src/db/`. PGlite and non-production Postgres apply them on connect. Production applies
them with `npm run db:migrate` as a release step; see `docs/PILOT_RUNBOOK.md`.

The canonical-text rules every stored offset depends on are in `NORMALIZATION.md`.

## Tests

`npx vitest run src/lodestone` runs the geometry alone and the network end to end on an
in-memory ledger with a hashed bag-of-words embedder (`test-embed.ts`). The thresholds
(`CLOSE` 0.75, `PAPER_FLOOR` 0.6) are tuned for Voyage and lowered explicitly in the
test; what is under test is the mechanism.

## Not built, on purpose

Campus-wide tenancy, mutual introductions with contact reveal, other card formats,
corpus ingestion beyond the seeded abstracts, and any lighter capture client. Regions
come from k-means over one blended vector per card and the profile bands will want
re-tuning once a real cohort exists. The plan for each is `docs/next-steps.md`.

OneDrive: exclude `node_modules/`, `.next/` and `data/` from sync.
