# The hand-made review (baseline)

The review the author got from the manual routine (an LLM plus the NeurIPS scrape) before this
workflow existed, pasted into the Whetstone design session on 2026-10-25. It is kept verbatim as the
baseline `review.md` is compared against. Its citations were never checked against a store.

---

I went through your corpus (28k NeurIPS papers) and the recent literature outside it. Short version: the core claim in that write-up holds up, but two newer audits already cover its descriptive half. The open territory is the why and the what to do about it.

Review of the idea

What holds up. The “frequency prior” thesis now has direct evidence. Mozafari, Piryani and Jatowt (May 2026) counted entity exposure across OLMo’s full Dolma pretraining corpus. They found that LLM popularity judgments track pretraining exposure more closely than they track real-world popularity, and the effect is strongest in larger models.

What needs correcting. The restaurant numbers in your note come from Pitenin’s Bali census (Aug 2026). That audit used search-grounded ChatGPT, Claude, Gemini and Perplexity, not base models. This makes your point stronger: even with live search, 85.6% of venues were never recommended. Getting into an answer depended on documentation (review volume, having a website, third-party mentions), and star rating had no effect. Rating only mattered for rank among the venues that got in. So “tool use fixes it” is not established. Grounding inherits the same visibility bias from the web.

What’s already taken:

Restaurant audits: Pitenin, and Chen/Weng/Moro’s five-city US audit, which found 47.5% of real venues never recommended even from a fixed list.
Agent shopping bias: Allouah et al.’s ACES (position bias, demand concentrating on a few products, model updates reshuffling market share). In your corpus: BiasRecBench (2026).
Generative engine optimization: C-SEO Bench (2025), plus E-GEO, AgentGEO and EcoGEO (all 2026).
Homogenization: Artificial Hivemind (2025), and The Subjectivity of Monoculture (2026). The latter is a warning: monoculture findings collapse once you control for item difficulty.

The real gap. Almost nobody measures popularity against an independent quality signal, so “popular ≠ best” is assumed rather than shown. Your business thesis (“be the high-signal tool agents call”) is also untested: no one has shown that agents actually defer to a better source when it conflicts with their prior.

Your corpus already contains a clean example of the decoupling. Among 13,338 NeurIPS 2021–24 papers, reviewer rating and citations per year correlate at only Spearman 0.18. There are 360 “hidden gems”: top-decile rating, bottom-quartile citations.

Top 5 study ideas

1. Popularity–quality decoupling audit (my top pick)

Question: When popularity and quality disagree, which one drives LLM recommendations, and does that change from base model to search-grounded model to agent?
Domains: pick ones with independent quality signals:
NeurIPS papers (reviewer scores vs. citations, straight from your corpus)
restaurants (expert guides or inspection grades vs. review count)
open-source libraries (maintenance and test health vs. GitHub stars)
wine (blind tasting scores vs. sales)
Measurement: use Pitenin’s two-stage model (entering the answer vs. rank within it) and estimate separate quality and popularity effects at each stage.
Why it’s new: it turns “frequency machine” from an assertion into a measured decomposition.

2. Will agents defer to the specialist?

Setup: a controlled sandbox where the agent has generic web search plus a specialized ranking API with provenance. Vary how much the API disagrees with the model’s prior, its credibility cues, and its schema quality.
Measures: when the agent overrides its prior, and when it ignores the better source.
Second half: a countermeasure, such as calibrated-deference prompting or a fine-tune.
Why it fits: this directly tests your business thesis, and it matches the “what steers an agent’s choice, plus a countermeasure” direction you prefer for the shop testbed. It could use the same harness.

3. Dose–response: what does it take to enter the canon?

Setup: inject fictional entities into continued pretraining of OLMo, crossing mention frequency with descriptions of quality. Then compare base and instruct pairs to see whether alignment amplifies the popularity bias.
Output: a threshold curve (“N mentions to become recommendable”) that is causal rather than correlational. Your BendBench fine-tuning tooling carries over.

4. The feedback loop

Setup: model the cycle where recommendations drive visits, visits drive reviews, and reviews feed the next index or training run.
Analysis: characterize when concentration runs away (Matthew effect, Pólya-urn style), then test fixes such as exploration bonuses or quality-weighted retrieval.
Grounding: calibrate the simulation on census-style data so it isn’t purely synthetic.
Neighbors in your corpus: Consumer Search and Social Learning in Agentic Markets and Impacts of Aggregation on Model Diversity (both 2026). NeurIPS likes this kind of theory-plus-simulation work.

5. HiddenGems benchmark (Datasets & Benchmarks track)

Content: queries whose verified best answer is high-quality but low-popularity, across 4–5 domains. The NeurIPS hidden-gem slice is ready-made for one of them.
Metrics: hidden-gem recall and popularity-adjusted nDCG, plus a debiased re-ranking baseline.
Strategy: lowest risk, and it could serve as the artifact that #1 or #2 runs on.
How I’d sequence it

Run #1 using #5 as the dataset for a NeurIPS 2027 D&B submission. Keep #2 as the main-track follow-on, since it shares infrastructure with the shop testbed.

The biggest risk to #1 is the quality signal. Reviewer scores, expert guides and blind tastings are all contestable, so validate on at least two domains with different kinds of quality signal. Otherwise reviewers will say you measured disagreement between two popularity proxies.

Sources:

Invisible to the Machine (Pitenin, arXiv 2608.07069)
LLMs create an uneven informational layer over cities (Chen, Weng, Moro)
Pretraining Exposure Explains Popularity Judgments in LLMs (Mozafari et al.)
What Is Your AI Agent Buying? (Allouah et al.)
NeurIPS corpus papers named above (C-SEO Bench, E-GEO, BiasRecBench, Artificial Hivemind, Subjectivity of Monoculture, Agentic Markets, Impacts of Aggregation)
