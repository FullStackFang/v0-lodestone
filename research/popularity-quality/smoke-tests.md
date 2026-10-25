# Smoke tests: popularity vs quality

One per top-3 study in `review.md`. Each threshold is fixed here, before anything runs.

## 1. Popularity–quality decoupling audit: do the two signals actually disagree in NeurIPS?

- **Hypothesis**: In NeurIPS 2023, reviewer rating and later citations are only weakly related,
  so the corpus can serve as a domain where quality and popularity disagree.
- **Measurement**: Spearman ρ between `rating_avg` and `citations_per_year`, over the 3,540
  rows from 2023. Every 2023 row has both values.
- **Threshold**: ρ > 0.6 kills. ρ ≤ 0.6 passes.
- **Kill means**: Rating and popularity move together in this domain. Study 1 cannot use NeurIPS
  as its decoupled domain, and the "popular ≠ best" premise needs a different domain before
  anything else is built.
- **Data**: The corpus spreadsheet (`NeurIPS_Corpus_2021-2026 (1).xlsx`, sheet `Corpus`,
  year = 2023), already on hand.
- **Time**: 1 hour. Cost $0.
- **Result**: Ran 2026-10-25. ρ = 0.106 over 3,526 rows, **pass, keep**. Of the 3,540 rows from 2023,
  14 carry the sheet's no-citation sentinel and were left out. Reviewer rating and later
  citations barely move together in this domain, so it can carry study 1. Next: smoke test 2.

## 2. Popularity–quality decoupling audit: does an LLM recommend the popular paper over the better one?

- **Hypothesis**: Asked for the best NeurIPS 2023 papers on a topic, an LLM names
  high-citation papers far more often than hidden gems with high ratings and low citations.
- **Measurement**:
  1. In 2023, define hidden gems as top-decile `rating_avg` and bottom-quartile
     `citations_per_year`, and popular papers as top-decile `citations_per_year` and
     bottom-half `rating_avg`.
  2. For 10 `primary_area` values, prompt one model 5 times: "Recommend the 10 best NeurIPS
     2023 papers on <area>."
  3. Match the titles to the corpus.
  4. Compute *r*, the rate at which gems are recommended (gems named ÷ gems in those areas)
     divided by the same rate for popular papers.
- **Threshold**: *r* ≥ 0.5 kills, meaning gems are recommended at least half as often as
  popular papers. *r* < 0.5 passes.
- **Kill means**: The popularity pull is too weak in this domain to build study 1 or the
  HiddenGems benchmark on. Move to study 3.
- **Data**: The corpus sheet, plus 50 calls to one model's API.
- **Time**: 4 hours. Cost under $5.
- **Result**: (not yet run)

## 3. Specialist deference: does an agent take the specialist's pick when it disagrees?

- **Hypothesis**: Given a specialist ranking tool whose top pick conflicts with the model's own
  first choice, the model keeps its own choice in most cases.
- **Measurement**:
  1. Take 40 of smoke test 2's prompts where the model's first pick is a popular paper.
  2. Re-run each with a tool result stating "Specialist ranking (reviewer-score based): #1 is
     <a hidden gem in the same area>".
  3. Compute the override rate: the share of answers whose first pick becomes the specialist's
     #1.
- **Threshold**: an override rate ≥ 0.8 kills. Below 0.8 passes.
- **Kill means**: Agents already defer to a specialist when it is handed to them. Study 3's
  question is answered, and the business thesis's risk is in being called, not in being
  believed.
- **Data**: Smoke test 2's prompts and outputs, plus the corpus sheet.
- **Time**: 3 hours. Cost under $5.
- **Result**: (not yet run)
