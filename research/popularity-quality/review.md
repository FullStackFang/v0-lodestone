# Do LLM recommendations follow popularity rather than quality?

Searched 2026-10-25: four sub-claim queries over the NeurIPS 2021–2026 corpus (58 stored hits)
plus live OpenAlex (60 hits). Every paper below is cited by its id in `search.json`.

## What holds up

- **The frequency prior has a mechanism.** In controlled pretraining, a language model passes
  through "an early phase where the LM selects entities by frequency" before it learns the task.
  Which phases appear depends on the statistics of the training data
  [1d46239d-5247-4f59-9f0c-9fea750546ae].
- **What a model saw rarely, it under-expresses.** On OLMo 2, with its training corpus fully
  visible, models encode rare facts with 84% separability but express them only 54% of the time
  [6c970d32-0723-4514-b89f-858e56247e46].
- **Strong priors resist being overridden.** When an adapted document contradicts pretraining,
  accuracy falls from 68% on weak-prior questions to 16% on strong-prior ones
  [517dfe9b-bae0-48c7-a5b9-bde50a0b1c48].
- **LLMs weight popularity over reliability when they read outside sources.** Across 13 models,
  they "rely on source popularity twice as much as source reliability", and they sit near chance
  on discerning which source to trust [d7872398-086b-461d-aee8-d762ad7b767d]. This is the
  strongest single support for the thesis that tool use does not fix the problem.
- **Generated recommenders inherit popularity bias.** Generative recommenders "are still
  susceptible to the long-standing issue of popularity bias"
  [6221c932-c407-4974-ac91-a28fd922d895]. Long-tail re-ranking with LLM help is a live line of
  work [ecdd903d-15e7-4c62-afaa-db8b7670115f].

## What needs correcting

- **"No one has shown whether agents defer to a better source" overstates the gap.** Information
  Discernment measures exactly the trade between popularity and reliability for external sources
  [d7872398-086b-461d-aee8-d762ad7b767d]. The open part is narrower: deference to a *specialist
  ranking* of items, as opposed to the weight a model gives a claim.
- **"Popular ≠ best" is regime-dependent, not universal.** A cultural-market model with intrinsic
  quality finds that popularity bias hinders quality both below and above a critical exploration
  cost, but that a narrow middle regime exists where choosing by popularity is near optimal
  [W2732691751]. A study has to say which regime its domain sits in.
- **Calibrated quality gaps are not new.** BiasRecBench already synthesises options "controlling
  the quality gap between optimal and sub-optimal options" to test LLM recommenders
  [e83a6efb-78b5-45c1-bca9-fc9c5675baaa]. What it injects are contextual biases, not a model's
  own pretraining popularity, so the decoupling audit is still distinct. It has to be framed
  against that benchmark, not as the first controlled test.

## What's already taken

- **Generative engine optimization**, single-page and competitive:
  - C-SEO Bench, "the first benchmark designed to evaluate C-SEO methods across multiple tasks,
    domains, and number of actors" [1c3f7004-bb5f-49ec-9949-c03b82b34a38]
  - E-GEO for e-commerce [1f86b5cc-4445-4b59-b40e-058eccd15564]
  - AgentGEO, on diagnosing why a document is not cited
    [79797812-8e24-4325-b101-99248051d52b]
  - EcoGEO, at the level of an agent's browsing trajectory
    [30c8fb34-4d34-45e0-b897-77e165c8901f]
  - adversarial ranking against web agents [a350860e-4e42-4d15-b03e-013e6f3cb593]
- **Audits of generative search sources.** A study of ChatGPT, Bing Chat and Perplexity finds
  "commercial and geographic biases in sources" [W4403433286].
- **Bias benchmarks for LLM recommenders:** BiasRecBench [e83a6efb-78b5-45c1-bca9-fc9c5675baaa].
- **Homogenization and monoculture:**
  - Artificial Hivemind [e96a9871-e55e-4183-867c-926c177eded3]
  - Monoculture or Multiplicity [bffd2f5b-2767-4cf7-abc5-71b38184be86]
  - outcome homogenization [7cdddfab-7a74-4b10-af7e-a864e66718bd]

  A warning applies: monoculture "virtually disappears in one dataset when we include item
  difficulty" [ccfe9a5c-4ae0-4893-a0aa-f3a17f0de819].
- **Feedback-loop theory**, which was study #4 in the hand-made review, is largely taken:
  - Self-consuming loops with co-evolving preferences converge to "singleton equilibria"
    [f0f81f62-d45c-4bce-bd5a-2655ae540aea].
  - In LLM ecosystems, "stronger selection increases concentration"
    [211eef46-3e11-4c5e-b58b-cb090b8f1278].
  - In agentic markets, hidden search signals can degrade outcomes
    [5f41e04d-c87e-4689-b4f4-4b8460914300].

## The real gap

No paper in the hits measures the following directly. Take items that have **an independent
quality signal and a popularity signal that disagree**. When an LLM recommends among them, which
signal predicts whether an item enters the answer, and does that change between a base model,
a search-grounded model and an agent with a specialist tool?

- Information Discernment does this for the reliability of claims and sources, not for items
  [d7872398-086b-461d-aee8-d762ad7b767d].
- BiasRecBench does it for injected biases, not for real popularity
  [e83a6efb-78b5-45c1-bca9-fc9c5675baaa].

NeurIPS papers are a ready domain: reviewer rating is the quality signal and citations per year
the popularity signal, both in the corpus. (uncited: whether the two actually decouple there is
the first smoke test, not a finding.)

## Top 5 studies

1. **The popularity–quality decoupling audit.** In domains where quality and popularity
   disagree, regress whether an item is recommended, and its rank once in, on both signals.
   Compare base, search-grounded and agent settings. Start with NeurIPS papers; expect
   citations to beat rating at the entry stage.
2. **Frequency exposure versus quality.** On a model with an open pretraining corpus, as LUMOS
   uses [6c970d32-0723-4514-b89f-858e56247e46], test whether how often an item appears in
   pretraining predicts its recommendation once quality is held fixed. Expect a positive
   exposure effect that grows with the strength of the prior
   [517dfe9b-bae0-48c7-a5b9-bde50a0b1c48].
3. **Specialist deference.** Give an agent a specialist ranking tool that disagrees with its
   prior, and measure how often it overrides the prior, varying the specialist's credibility
   cues. Expect under-deference, given the popularity-over-reliability finding
   [d7872398-086b-461d-aee8-d762ad7b767d]. Report the item-level result against that
   claim-level baseline.
4. **HiddenGems benchmark.** Queries whose verified best answer is high in quality and low in
   popularity, starting with the NeurIPS slice. Metrics are hidden-gem recall and
   popularity-adjusted nDCG. It is the dataset that studies 1 and 3 run on.
5. **Regime test.** Fit the exploration-cost model [W2732691751] to LLM recommendation data, to
   say where LLM recommendation sits between "popularity hinders quality" and "popularity is a
   good proxy".

## Sequencing

Run smoke test 1 first: it is an hour, free, and it decides whether the NeurIPS domain can carry
study 1 at all. If it passes, smoke test 2 checks that the effect exists before anyone builds
study 4's benchmark. Study 4 then becomes study 1's dataset. Study 3 follows on the same harness.

Two results would change the order:
- If smoke test 2 shows recommendations already track rating, studies 1 and 4 lose their premise
  and study 3 moves first.
- If smoke test 3 shows near-total deference, study 3 drops.

## Biggest risk

The quality signal. Reviewer rating is a contested measure of quality, and monoculture-style
findings have collapsed once item difficulty was controlled
[ccfe9a5c-4ae0-4893-a0aa-f3a17f0de819]. Without a second domain with a different kind of
quality signal, a reviewer can say the study measured disagreement between two noisy proxies.
Second, the novelty margin is thinner than the hand-made review assumed: the popularity-over-
reliability effect is already published for sources [d7872398-086b-461d-aee8-d762ad7b767d].

## Sources

- [1d46239d-5247-4f59-9f0c-9fea750546ae] Pretraining Data Statistics Shape the Phases of Learning Entity Comparison in Language Models (2026): https://neurips.cc/virtual/2026/poster/151759
- [6c970d32-0723-4514-b89f-858e56247e46] LUMOS: Tracing Parametric Knowledge from Training Data to Behavioral Outputs in LLMs (2026): https://neurips.cc/virtual/2026/poster/139740
- [517dfe9b-bae0-48c7-a5b9-bde50a0b1c48] The Override Gap: A Magnitude Account of Knowledge Conflict Failure in Hypernetwork-Based Instant LLM Adaptation (2026): https://neurips.cc/virtual/2026/poster/149824
- [d7872398-086b-461d-aee8-d762ad7b767d] Information Discernment in Large Language Models (2026): https://neurips.cc/virtual/2026/poster/154203
- [6221c932-c407-4974-ac91-a28fd922d895] Echoes in Filter Bubble: Diagnosing and Curing Popularity Bias in Generative Recommender Systems (2026): https://neurips.cc/virtual/2026/poster/148459
- [ecdd903d-15e7-4c62-afaa-db8b7670115f] AgentTailor: Dual-Gate LLM-Assisted Re-ranking for Personalized Long-Tail Recommendation (2026): https://neurips.cc/virtual/2026/poster/154386
- [W2732691751] How algorithmic popularity bias hinders or promotes quality (2018): https://doi.org/10.1038/s41598-018-34203-2
- [e83a6efb-78b5-45c1-bca9-fc9c5675baaa] Is Your LLM-as-a-Recommender Agent Trustable? LLMs' Recommendation is Easily Hacked by Biases (Preferences) (2026): https://neurips.cc/virtual/2026/poster/139736
- [1c3f7004-bb5f-49ec-9949-c03b82b34a38] C-SEO Bench: Does Conversational SEO Work? (2025): https://openreview.net/forum?id=oTeixD3oZO
- [1f86b5cc-4445-4b59-b40e-058eccd15564] E-GEO: A Testbed for Generative Engine Optimization in E-Commerce (2026): https://neurips.cc/virtual/2026/poster/139483
- [79797812-8e24-4325-b101-99248051d52b] Diagnosing and Repairing Citation Failures in Generative Engine Optimization (2026): https://neurips.cc/virtual/2026/poster/153428
- [30c8fb34-4d34-45e0-b897-77e165c8901f] EcoGEO: Trajectory-Aware Evidence Ecosystems for Web-Enabled LLM Search Agents (2026): https://neurips.cc/virtual/2026/poster/153813
- [a350860e-4e42-4d15-b03e-013e6f3cb593] Synthetic Web: Benchmarking Language Agents under Adversarial Search Ranking (2026): https://neurips.cc/virtual/2026/poster/155345
- [W4403433286] Generative AI Search Engines as Arbiters of Public Knowledge: An Audit of Bias and Authority (2024): https://doi.org/10.1002/pra2.1021
- [e96a9871-e55e-4183-867c-926c177eded3] Artificial Hivemind: The Open-Ended Homogeneity of Language Models (and Beyond) (2025): https://openreview.net/forum?id=saDOrrnNTz
- [bffd2f5b-2767-4cf7-abc5-71b38184be86] Monoculture or Multiplicity: Which Is It? (2025): https://openreview.net/forum?id=DO5LtJc80w
- [7cdddfab-7a74-4b10-af7e-a864e66718bd] Picking on the Same Person: Does Algorithmic Monoculture lead to Outcome Homogenization? (2022): https://openreview.net/forum?id=-H6kKm4DVo
- [ccfe9a5c-4ae0-4893-a0aa-f3a17f0de819] The Subjectivity of Monoculture (2026): https://neurips.cc/virtual/2026/poster/153977
- [f0f81f62-d45c-4bce-bd5a-2655ae540aea] Self-Consuming Generative Models with Co-Evolving Human Preferences (2026): https://neurips.cc/virtual/2026/poster/148960
- [211eef46-3e11-4c5e-b58b-cb090b8f1278] How Selection Shapes Diversity in LLM Ecosystems (2026): https://neurips.cc/virtual/2026/poster/152662
- [5f41e04d-c87e-4689-b4f4-4b8460914300] Consumer Search and Social Learning in Agentic Markets (2026): https://neurips.cc/virtual/2026/poster/154159
