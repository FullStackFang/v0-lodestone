> Archived 2026-10-10. This describes the pre-trim Thesis Forge app; none of its routes exist in Lodestone. Kept for the record.

# Research MVP: broader agent evaluation

2026-09-06. **The workflow is usable, but the current matcher is not reliable enough to treat its suggestions as relevant without review.** The prepared example overstates how well ordinary wording works. This evaluation found actionable matching, evidence-context, and feedback-version problems without requiring user input.

## Scope and method

Ran 16 fixed scenarios against the existing three-paper collection through the real intake, database, refresh-run and suggestion-selection services. Used a fresh in-memory PGlite database with a synthetic member. Reproduced six selected cases through the running local app in isolated browser pages. Then checked a changed-need feedback case in both the service and browser.

Expected source sets were written before executing the cases, after inspecting the existing matcher and papers. They are agent relevance judgments, not blinded labels, authentic founder needs, user usefulness ratings, or a representative benchmark. A relevant result means a plausible research lead; it does not mean the study proves the proposed application. The original broad retention scenario deliberately gives the system generous credit for all three previously proposed leads.

No matcher, source excerpt, or production behavior was changed during this evaluation. Preserve this baseline. It can become development data for improvements, but further evaluation should include newly written, reserved scenarios rather than claim these now-inspected cases are an unseen holdout.

## Results

| Measure | Result |
| --- | --- |
| Exact agreement with the expected source set | 6 of 16 cases |
| Needs with an expected lead that received at least one relevant source | 6 of 10 |
| Returned suggestions judged relevant to the scenario | 8 of 15 |
| Expected scenario/source pairs retrieved | 8 of 14 |
| Negative cases correctly left empty | 2 of 6 |
| Browser cases agreeing with service results | 6 of 6 |

These counts describe only this small, deliberately diagnostic matrix. All figures concern the first pass, before lifecycle testing altered a control need.

Sources: SC01 = liking gap; SC06 = compliment reception; SC09 = experience-related storytelling. An empty set is written as none.

| Case | Need variation | Expected | Returned |
| --- | --- | --- | --- |
| S01 | Prepared social-connections example | SC01, SC06, SC09 | SC01, SC06, SC09 |
| S02 | Newcomers assume nobody wants to see them again | SC01 | none |
| S03 | Original first-visit-to-return hypothetical need | SC01, SC06, SC09 | SC01 |
| S04 | Literal question about conversation partners' liking | SC01 | SC01 |
| S05 | Members hesitate to praise contributions | SC06 | none |
| S06 | Literal question about compliment reception | SC06 | SC06 |
| S07 | Will a compliment help? | SC06 | SC06 |
| S08 | Will compliments help? | SC06 | none |
| S09 | Swap stories about shared activities | SC09 | none |
| S10 | Literal question about experiential purchases | SC09 | SC01, SC09 |
| S11 | Battery recycling | none | none |
| S12 | Two people review company invoices | none | SC01 |
| S13 | Five studies before staffing-budget decisions | none | SC06 |
| S14 | Transport needed; explicitly excludes conversation prompts | none | SC01, SC09 |
| S15 | Scheduling around work and childcare | none | none |
| S16 | Company pensions and financial advice | none | SC01, SC09 |

The exact scenario text, expectations and rationale are in `../evals/resources/scenarios.json`. Raw counts, matching terms, scores, source identities, hashes and operational observations are in `../evals/resources/baseline.json`.

## Findings, in priority order

### 1. Generic word overlap creates irrelevant suggestions

An invoice-approval need received the liking-gap paper because of company, people and two. A staffing-budget need received the compliment paper because of five and studies. The literal storytelling case also received the liking-gap paper from people and them. All are anchored to genuine source words; quotation fidelity alone does not establish relevance.

Browser reproduction confirmed the invoice and staffing cases. The transport case still received conversation-related sources despite explicitly rejecting those activities. The current matcher uses two overlapping tokens and does not interpret negation or the role of a term. The idea description is saved and displayed but is not an input to `matchResource`.

Next implementation work should require a substantive connection to the current need and its constraints, with the ability to reject irrelevant candidates. Simply adding more papers would leave this failure mode intact. Compare the revised approach with this baseline and fresh cases before choosing a more complex retrieval system.

### 2. Ordinary paraphrases and even pluralization lose useful leads

The praise/appreciation and shared-activity-story scenarios returned nothing. In the controlled singular/plural pair, changing only compliment to compliments removed the result. Three of the four natural-wording scenarios returned no relevant source; the original broad need received only one of the three exploratory leads.

The prepared example deliberately contains vocabulary from all three excerpt records. Its success should be presented as an example of the workflow, not evidence that arbitrary natural-language needs work equally well. Evaluate inflection and paraphrase handling using supported research concepts, while retaining the ability to reject unrelated overlap.

### 3. Old feedback can appear to judge a substantially revised need

Marked the liking-gap suggestion helped with an explicitly synthetic note about reciprocal interest. Changed the need to scheduling company meetings and measuring administrative hours saved. Before refresh, stale recommendations were hidden correctly. After refresh, the same source matched company/people, the recommendation adopted the new need revision, and the old helped status and note reappeared without identifying the original need version.

In the isolated service run, both current need and recommendation revision were 4 while the note still described the earlier social-reconnection goal. The schema has no separate feedback need revision. The browser reproduced the same behavior on the newly created S04 test idea; its URL now shows that follow-up state, not its initial scenario state.

Preserve feedback history against the version actually judged. A materially changed need should show its earlier judgment as historical and allow a fresh assessment; do not silently reinterpret old feedback as validation of the new problem.

### 4. Evidence is traceable but too thin to assess applicability inside the app

All three source links resolved during this review. The six selected method/result excerpts were consistent with the cited primary-source locations. Imports anchored the excerpts successfully. However, none of the three sample records contains a conditions claim or a limitations claim. Two method excerpts principally say how many studies were conducted. They supply little usable methodological context.

| Source | Checked locations | Application assessment |
| --- | --- | --- |
| [SC01: liking gap](https://faculty.wharton.upenn.edu/wp-content/uploads/2020/05/The-Liking-Gap-in-Conversations.pdf) | PDF page 2, Study 1a Method; page 1 Abstract | The proposed organizer interview and mutual-follow-up hypothesis are concrete. The quoted result does not establish that follow-up improves attendance. |
| [SC06: compliment reception](https://journals.sagepub.com/doi/10.1177/0146167220949003) | Publisher Abstract, study-count and giver-prediction sentences | Asking whether optional appreciation would feel welcome is a reasonable exploration. This sample remains abstract-only and does not verify detailed protocols or durable connections. |
| [SC09: experiential purchases](https://www.kumar-amit.com/s/Kumar-Gilovich-in-press-Some-Thing-to-Talk-About-PSPB.pdf) | PDF page 3, research overview; page 1 Abstract | The memorable-moment prompt is explicitly an extrapolation. Ratings about discussing purchases do not demonstrate the group-activity adaptation. |

The three curator application paragraphs contain specific actions and transfer cautions, but they are fixed per paper. An invoice-approval query receives the same group-organizer suggestion as the friendship example. Every returned recommendation also has the same generic Next Step sentence. That sentence directs the user to compare conditions and limitations even though those fields are unrecorded in this sample.

Enrich the evidence records with useful source-supported purpose, method, result, population/context and limitations. Keep proposed applications separate, then make the recommended next action fit the actual need. This is a curation and recommendation-quality gap, not evidence that any quoted paper is fabricated.

## Operational checks that held

The 16 needs saved through the real atomic intake service and generated 15 recommendations in the first owner refresh. Repeating refresh created zero new rows. Explicitly synthetic feedback persisted. Pausing a need hid its suggestions, edited revisions remained hidden until refresh, and resuming restored suggestions. Those assertions completed successfully in the evaluation runner.

The earlier local MVP verification additionally covers validation errors, ownership rejection, rollback on database failure, mobile layout and persistence after restart. This round complements those checks with relevance testing; it does not replace production Postgres or real-participant validation.

## Reproduce and inspect

From `thesis-forge`:

```powershell
npx.cmd tsx evals/resources/evaluate.mts data/checks/research-scenario-evaluation-rerun.json
npm.cmd run typecheck
```

The runner writes a report and asserts operational invariants. Exit zero means the evaluation ran successfully, not that recommendation quality passed. Compare its quality counts and per-case outputs with the preserved `baseline.json`. A new explicit output path avoids overwriting the baseline.

`../evals/resources/browser-results.json` records the six browser cases. A screenshot of the invoice false positive is at `../data/checks/research-scenarios-false-positive.png`. The six new browser ideas are labeled Agent evaluation and belong to the isolated synthetic demo member. The only new feedback entered into the demo was explicitly labeled agent evaluation; no real-user usefulness judgment or external message was recorded.

Typecheck passed with the evaluation harness. Production application files and the three-source sample were left unchanged, so no new production build was needed for this evaluation-only pass.

## What requires user input

The matcher, evidence-context and feedback-version problems can be addressed without asking the user to supply personal judgments. Personal usefulness remains a separate question for a later real idea. The next engineering work should resolve the failures above and test on fresh scenarios before asking the user to spend time judging a larger collection.
