# Competitive landscape and MVP positioning

Written 2026-10-15 from four parallel research passes (university research-to-venture
tools; AI literature assistants; startup ideation and VC intelligence; scholarly data
infrastructure). Roughly 70 products were checked. Anything marked UNVERIFIED rests on
aggregators or pages that could not be fetched.

## The concept under test

Whetstone (local, model in the loop) holds a founder's idea as nine business-model blocks.
Lodestone (published server) takes that idea, finds papers and patents, says why each one
matters and to which block, and records the founder's verdict (useful / known / not
relevant) as the idea pivots. Verdicts accumulate into a graph that improves what the
next founder with a similar idea is shown.

## Headline

Nobody does this. Across all four slices no product combines the four properties:

1. a structured, evolving business idea as the query (not a search string, not a seed paper);
2. a per-block explanation of why a paper or patent matters;
3. founder feedback that is persisted and reused across users;
4. an API meant for a third-party local client.

The field is "query in, papers out" for researchers, pharma R&D and corporate IP teams.
The retrieval layer is being commoditised (OpenAlex semantic search, Exa publications
index, Semantic Scholar, Elicit and Consensus APIs). The defensible layer is the idea
model, the feedback loop and the cross-user graph.

## The three names you asked about

**MIT JetPack (Orbit, Martin Trust Center).** Launched Sept 2024, v2 by spring 2025. A
founder enters an idea and an LLM drafts the 24 Disciplined Entrepreneurship steps:
segmentation, beachhead, personas, pricing, TAM. It uses no papers, no patents, no
OpenAlex or arXiv. It does not learn from feedback and has no API. Access is MIT plus a
handful of pilot schools via waitlist. It is the closest in *workflow* (idea first,
structured, iterated per step, university brand) and the furthest in *grounding*. Risk:
the Trust Center has the brand and the student pipeline to add a literature layer.
Sources: news.mit.edu/2024/new-ai-jetpack-accelerates-entrepreneurial-process-0919,
d-eship.com study (2025-05-25).

**a16z.** Nothing overlapping. Speedrun is capital, residency and credits. Big Ideas 2026
is editorial; two entries read as thesis support rather than competition: "autonomous
labs close the loop on scientific discovery" and "AI-native university with reading lists
that update as new research appears". No a16z or YC investment found in a paper-to-founder
product 2024 to 2026. a16z did lead Exa's $250M Series C (May 2026), which is a retrieval
supplier to Lodestone, not a competitor.

**StartupTree.** Ecosystem-management SaaS for universities: events, venture database,
competition forms, mentor matching, jobs. 195k users, 140 platforms, ~$5k+/yr. No
research matching, no AI, no API. It is a potential distribution channel (it already
sits inside the entrepreneurship centres Lodestone would pilot in), not a competitor.

## Closest overlaps, by slice

| Product | What overlaps | Where it stops |
| --- | --- | --- |
| scientifiq.ai (Duke Fuqua, Jun 2025) | OpenAlex + patents, LLM embeddings over 139M abstracts, predicts commercial potential, "companies that could benefit" | Scores papers in general, never against a founder's idea; no feedback; audience is TTOs and VCs |
| Deep Science Ventures "Outcomes Graph"; Flagship "Pioneering Intelligence" | Shared ontology and knowledge graph used to originate ventures from scientific knowledge, improved by collective work | Internal, biotech/deep-tech, starts from an outcome not a business model, no API |
| ScoutinScience (NL, EUR 1M seed Jul 2025, 22+ orgs) | NLP scoring of papers for business potential, TRL, grant matching | Sold to TTOs, works from the paper outward, no founder input |
| Semantic Scholar Research Feeds; Scholar Inbox | The only real useful / not-relevant loops that change rankings | Strictly per user, keyed to seed papers in a folder, no patents, no API for the feed |
| Keenious (OpenAlex, 165k add-in installs) | Recommends papers from the user's own document text | Deletes the document after a day, no memory, no learning, no API, no patents |
| Google Scholar Labs / Quick Read (GA Jun 2026) | Per-paper "how this helps answer your question" | Question level, no project memory, no API |
| Elicit (API v2 + MCP, $49/mo); Consensus API ($0.05/call); Undermind MCP | Persistent "project" containers plus agentic literature search with APIs a client could call directly | Query-shaped, no idea structure, no re-ranking on feedback, researcher-facing |
| Cypris; PatSnap Eureka; XLSCOUT; TurboInnovate; FirstIgnite (acquired Feb 2026) | Idea or disclosure in, papers and patents out, with traceable citations; PatSnap has an API and 31 MCP servers | Input is a technical disclosure, users are IP and R&D teams, enterprise sales-led, no cross-user learning (Eureka explicitly does not train on customer data) |
| Perplexity Patents (Oct 2025), Exa publications index (350M pubs incl. patents, ~$0.007/search) | Generic substitutes a founder might reach for; Exa gives per-result "why this matters for X" summaries | Session only, no idea model, no feedback, no founder framing |
| Paperade (2022-23), tatevlab (Show HN May 2025), openreview-copilot | Founder-facing "papers to startup ideas" attempts | All dead or hobby; one HN comment: single-paper LLM ideation is shallow without deeper research |
| Evertrace (Copenhagen, API + MCP) | Monitors papers and patents to detect founders early | Sells to VCs, not founders |
| Ideabrowser, Validator AI, DimeADozen, Preuve and ~20 validators | Idea validation with "cited sources" as the race | Sources are Reddit, Trends, G2, filings; none cite papers or patents; no API |
| LEANSpark (Leanstack, MCP server), Strategyzer, Canvanizer | Structure the idea exactly like Lodestone's blocks | Pull in no literature; LEANSpark is a plausible *client* of Lodestone |

UNVERIFIED but worth a manual look: TUM Venture Lab "AI from research papers to venture
potentials" (knowledge graph over ~20M documents), Cambridge Future Tech "Fit Assessment"
beta, 1848 Ventures hiring for a "knowledge engine with feedback loops between venture
outcomes and idea generation".

## Demand signals

- Scientist-to-founder programmes are scaling with no literature tooling: Fifty Years
  5050 (445 scientists, 105 companies), Antler, Entrepreneur First, a16z Alpha Fellowship,
  DSV Venture Science Doctorate. All are channels.
- Tech-transfer buyers pay: ScoutinScience's seed, FirstIgnite's acquisition, AUTM 2026
  reporting disclosure triage as the top unmet need and trust/confidentiality as the
  adoption blocker.
- Research-discovery capital flows to researcher-facing products (Consensus $30M May 2026,
  Edison $70M Dec 2025, alphaXiv $7M Nov 2025). The founder-facing application layer is open.
- Validator tools compete on citations but none has reached academic or patent evidence.

## What Lodestone is, and is not, today

Already built (see `README.md`, `docs/api.md`): structured cards from Whetstone's
`forge-idea/4` export; an OpenAlex and PatentsView corpus with provenance; cosine ranking
per block with a `blocks` explanation; `already_have` so a founder's own paper is not a
find; a verdict endpoint with the context the founder saw; member tokens for a client.
This is the shape of the MVP. The gaps:

1. **Not published.** Phase 3 of `docs/next-steps.md` (Postgres via Neon or Supabase,
   Resend, cron) has not run.
2. **The corpus is what someone ingested by query**, not "all of OpenAlex and arXiv".
3. **No "why".** Rule 1 says no model is called on the server; today the explanation is
   the block name and a cosine.
4. **Feedback is stored, not used.** Verdicts feed a threshold retune and nothing else.
5. **Two data sources moved under us** (see below).

## Infrastructure facts that change the plan

- **PatentsView is gone.** `search.patentsview.org` no longer resolves (probed
  2026-10-15); patentsview.org redirects to a USPTO transition page. Replacements: Google
  Patents Public Datasets on BigQuery (abstracts, 64-dim embeddings, pay per query), EPO
  OPS (4 GB/week free), USPTO Open Data Portal (key required), Exa's publication index.
- **OpenAlex is metered.** Keyless requests share $0.10/day per IP (confirmed live).
  Free key: $1/day, 30 rps. Keyword search $0.001/call, semantic search $0.001/call
  (GTE-large, 1,024-dim, 1 rps, 50 results, beta). Annual: Member $5k, Member+ $10k with
  daily snapshots. `search.ts` already sends `OPENALEX_API_KEY`; `openalex.ts` (single work
  lookup) still only sends mailto.
- **Abstract coverage** is 55% of default-view works (~181M of 327M); Elsevier and
  Springer Nature withdrew many closed-access abstracts.
- **Mirroring everything is a funded-team cost**: ~54B tokens to embed (~$3,250 at
  voyage-3.5, ~$1,100 at cheaper models), ~740 GB float32 vectors, $300 to $1,000+/month
  to serve, a 745 GB snapshot to re-ingest quarterly.
- **Federation is pennies**: 3 to 10 OpenAlex semantic or keyword searches per idea plus
  Semantic Scholar (free, 1 rps) plus arXiv (free, one request per three seconds), embed
  only the hits (~$0.01 per idea), cache in pgvector. The free OpenAlex budget covers
  ~1,000 semantic searches a day. This is what `lodestone:ingest` already does, minus the
  semantic front end.
- **arXiv metadata is CC0** and commercial reuse is allowed; full text may not be served
  from your servers. Semantic Scholar is ODC-BY with attribution and no redistribution.
  Its recommendations endpoint accepts positive and negative paper ids, but using it for
  the verdict loop would send a founder's `useful` set off our servers; see step 4.

## Positioning in one line

Every tool answers "what papers match this query". Lodestone answers "what research
matters to *this idea as it is right now*, and it gets better because the last hundred
founders told it what mattered to theirs".

## MVP that is different

Keep the shape that exists and add the pieces no competitor has, in this order. The
per-pivot diff is the day-one value and works for one user. The cross-user prior is
schema-only until roughly a hundred cards exist.

0. **A fixed eval set before anything ships.** Thirty queries: real or synthetic cards
   with a hand-marked relevant set each, kept in `evals/lodestone/`. Every step below is
   judged by whether it moves precision at 5 and the cross-field count on this set. Without
   it the verdict stages cannot be shown to change rankings. Baseline (2026-10-16,
   `evals/lodestone/eval-set/baseline.md`, search off, 30 cards over ~1,040 papers):
   P@5 0.207, R@10 0.517, MRR 0.502, 4.63 distinct fields in the top ten. The ten
   cross-field cards reach MRR 0.303 against 0.601 for the rest. The marks are
   Claude's calls, not hand-marked.
1. **Publish** (Phase 3 as written): Neon or Supabase Postgres with pgvector, Resend,
   Vercel cron, `db:migrate` as a release step. Replace PatentsView with Google Patents
   Public Datasets on BigQuery before deploy: it is the only replacement with abstracts,
   CPC codes and embeddings in one place. EPO OPS is for later. Fix the single-work
   OpenAlex lookup to send the key.
2. **Live retrieval, not a mirror.** A `search` step on card import: for each block, one
   OpenAlex semantic search and one keyword search, a Semantic Scholar search, arXiv for
   the last ninety days. Union, dedupe on DOI/OpenAlex id, ingest and embed the hits into
   the existing corpus tables. The card then ranks against a corpus that was built *for*
   it plus everything earlier cards pulled in. "Access to all of OpenAlex" becomes true
   at query time for a dollar a day. Two rules make the results cross-domain rather than
   same-field:
   - **Query with abstracted text, not raw blocks.** Federated APIs are topic search; a
     raw customer-segment entry retrieves the founder's own field. Whetstone writes an
     abstracted purpose at two levels of generality (a `purpose_l1` and `purpose_l2` on
     the export, not yet in `forge-idea/4`) and Lodestone sends those alongside the block
     text. The `purpose` block weight in `vectors.ts` is unrelated.
   - **Field-quota rerank.** At most three hits per OpenAlex field, or CPC section for
     patents, in the top ten. Nothing in `priorArt.ts` does this today.
3. **The why, computed where the model lives.** Lodestone returns, per hit, the block,
   the cosine, and the three abstract sentences closest to that block's entries (sentence
   embeddings, no model call, rule 1 intact). Whetstone, which already has Claude in the
   loop, writes the one-paragraph "why this could matter to your value proposition" from
   those sentences and the card. Only 55% of OpenAlex works carry an abstract, so about
   half of hits have no sentences to return. For those, fall back to title plus the
   Semantic Scholar TLDR and mark the hit `thin: true` so Whetstone flags its why as
   lower confidence. If you later decide the server should write the why, that is a
   one-line rule change, but it is not needed for the MVP and it keeps the server cheap.
4. **Feedback that changes the ranking.** Three uses of `card_feedback`, in order of cost:
   - per card: `not_relevant` hits drop and `useful` hits pull their nearest neighbours
     up. Do this locally in pgvector, since the hits are already embedded: it is a
     neighbour query over the `useful` vectors, about ten lines. Do not send positive and
     negative ids to Semantic Scholar's recommendations endpoint by default; that leaks a
     founder's `useful` set, and AUTM names confidentiality as the adoption blocker. If
     ever used, gate it behind an explicit opt-in;
   - per idea over time: when a block changes (pivot), re-run step 2 for that block only
     and show the diff: "since you changed your customer segment, these five are new and
     these three no longer apply". This is the day-one value;
   - across users: a `paper x block x verdict` table. When a new card's block vector is
     close to a block that earned `useful` verdicts on paper P, P gets a prior. That table
     is the knowledge graph. It starts as one SQL join and needs no graph database. Create
     the table on day one; turn the prior on when the cohort has about a hundred cards.
5. **One cohort, one channel.** Pilot inside an entrepreneurship centre that already runs
   StartupTree or JetPack-style curricula. The director's map (built) is the thing those
   centres cannot get elsewhere.

What to leave out of the MVP: a full OpenAlex mirror, a graph database, an LLM on the
server, patents beyond BigQuery, any UI beyond what Whetstone's panel shows.

## The changes that build it

Written 2026-10-15 as OpenSpec changes. Lodestone's are under
`openspec/changes/` here; Whetstone's under the same path in `../v0-whetstone`.
Each has a `tasks.md` whose first section names what it waits on.

| Order | Lodestone | Whetstone | MVP step |
| --- | --- | --- | --- |
| 1 | `lodestone-corpus-compact` (in flight) | `forge-paper-support` (two manual checks left) | prerequisite |
| 2 | `lodestone-sources-repair` §1 (OpenAlex key) | | 1 |
| 3 | `lodestone-eval-set`, rest of `sources-repair`, code half of `publish`, in parallel | | 0, 1 |
| 4 | `lodestone-publish` deployment | | 1 |
| 5 | `lodestone-card-search` (with the search-independent halves of 6 and 7 beside it) | `forge-idea-purpose` | 2 |
| 6 | `lodestone-hit-sentences` | `forge-network-why` | 3 |
| 7 | `lodestone-verdict-ranking` | `forge-pivot-diff` | 4 |

The two umbrella changes, `lodestone-mvp` and `whetstone-mvp`, hold the
gates between rows. Rows 2 to 4 are independent of Whetstone and can start
now. Each Whetstone change depends on the Lodestone change beside it for its
API shapes, which that Lodestone change writes into `docs/api.md`; Whetstone
builds against a fixture until then. Both sets were reviewed cold against the
code on 2026-10-15 and revised; the reviews' main findings were an
owner-verdict leak to cohort viewers, a label-versus-key mismatch on blocks,
an eval baseline with no distractors, a BigQuery query that would rescan per
page, and on the Whetstone side a run-commit path that skipped the required
second step.

## Risks

- **Retrieval is a commodity.** Whetstone could call Exa or Elicit directly. Lodestone
  must earn its place with the feedback graph and the cohort, not with search.
- **Cold start.** Cross-user learning is worthless at ten users. Per-card and per-pivot
  feedback deliver value at one user; design the schema for the third use from day one.
- **Incumbents one feature away**: Elicit (Projects + Research Agent + API), Google
  (Scholar Labs + Gemini project memory), MIT Trust Center (brand + pipeline).
- **Trust.** AUTM 2026 names confidentiality as the adoption blocker. Lodestone's
  private-by-default rule and "cohort sees blocks, never the thread" are the right
  answer; keep them visible in the pitch.

## Sources

MIT: news.mit.edu/2024/new-ai-jetpack-accelerates-entrepreneurial-process-0919;
d-eship.com/articles/studying-the-effect-of-ai-tools-orbit-jetpack-on-the-entrepreneurial-education-process/;
protoventures.mit.edu. a16z: speedrun.a16z.com; a16z.news/p/big-ideas-2026-part-1 and -part-2;
exa.ai/blog/series-c. StartupTree: startuptree.co; capterra.co.uk/software/1016064/startuptree.
Research-to-venture: scientifiq.ai; fuqua.duke.edu/duke-fuqua-insights/can-AI-predict-commercial-value-next-scientific-breakthrough;
scoutinscience.com; deepscienceventures.com; flagshippioneering.com/process; firstignite.com;
seedtable.com/exits/firstignite; in-part.com/connect; halo.science; turboinnovate.com;
solveintelligence.com/blog/post/reflections-from-autm-what-tech-transfer-offices-really-need-in-2026;
news.ycombinator.com/item?id=43861561. Literature tools: elicit.com/pricing; docs.elicit.com;
consensus.app/home/api; scite.ai/api; undermind.ai/mcp; semanticscholar.org/product/api;
allenai.org/asta/resources/mcp; keenious.com/pricing; arxiv.org/abs/2504.08385 (Scholar Inbox);
scholar.googleblog.com; exa.ai/blog/publications-search; exa.ai/pricing; alphaxiv.org/about;
edisonscientific.com; rdworldonline.com (Cypris, 2026-06-19). Ideation: ideabrowser.com;
validatorai.com; dimeadozen.ai; preuve.ai/compare; leanspark.ai; ycombinator.com/rfs.
Infrastructure: help.openalex.org/access/pricing.md; help.openalex.org/api/semantic-search/;
help.openalex.org/access/snapshot.md; blog.openalex.org/?p=3953; info.arxiv.org/help/api/tou.html;
info.arxiv.org/help/bulk_data_s3.html; semanticscholar.org/product/api/license;
ropensci.org/blog/2026/03/10/patentsview-breaking-release/; docs.voyageai.com/docs/pricing;
neon.com/pricing; supabase.com/pricing; pinecone.io/pricing; weaviate.io/pricing;
cloud.google.com/blog/topics/public-datasets/google-patents-public-datasets-connecting-public-paid-and-private-patent-data;
epo.org/en/searching-for-patents/data/web-services/ops.
