# Try the research MVP

The flow is: describe an idea, save one unresolved need, review cited research, and record what it helped you decide to do next.

## Local demo

From `thesis-forge`:

```powershell
npm.cmd run resources:demo
```

Open [the local demo](http://localhost:3012/demo). It signs into a synthetic test account and opens an editable social-connections example. Click **Save idea and find research**. The first save creates the idea and need and checks the sample collection; it makes no model call.

Review the three suggestions. Each shows its source, quoted evidence, a separate proposed application, and any recorded conditions or limitations. Enter **My next action or reason**, then choose **Helped** or **Not helpful**. You can dismiss a suggestion or leave the need open. Use **Check for new research** later; repeating a check does not duplicate recommendations or erase feedback.

Your example work persists across restarts in `data/research-mvp`. The test account is deliberately excluded from real pilot measurement. This launcher binds only to loopback, uses its own compiler directory, blanks external database/email configuration, and captures its demo sign-in link internally. It is not part of the production server or a production authentication option. Use this account only for example work.

The existing app server can continue running separately. Stop this demo with Ctrl+C in its terminal. To resume, run the command again and open `/demo`; it creates a fresh sign-in link for the same local test account.

## Using the ordinary app

An authenticated active member can open **New idea** and use the same research intake with their own words. **Ideas → Research for this idea** returns to the saved needs and suggestions. Source imports remain curator-only. The normal app's database and membership controls are unchanged.

The example link only prefills editable text. Nothing is saved until submitted, and the three sample papers are installed only by the local demo launcher. An ordinary app with an empty collection will correctly show no suggestions.

## What the first version can and cannot tell you

Retrieval uses shared words in source quotations. It can miss synonyms and return weak connections; the explanation names that limitation. The view starts with up to three suggestions per need and offers the remainder when available. It never pads an unrelated need with the sample papers.

Marking a suggestion as helped records your judgment and next action. It does not establish scientific efficacy, customer validation, or successful completion of a proposed experiment. You can act by interviewing someone, changing a prototype, checking a source more closely, or planning a test.

## Sample provenance

`scripts/resources/social-sample.json` contains three small excerpt records from real Cornell-affiliated publications. Its `sourceDate` is the excerpt collection date, 2026-09-06, not an invented publication day. Identifiers name the DOI and excerpt coverage. Excerpts are re-anchored through the existing importer on each run; duplicate source/text identities are reused.

- [The Liking Gap in Conversations](https://faculty.wharton.upenn.edu/wp-content/uploads/2020/05/The-Liking-Gap-in-Conversations.pdf): method excerpt from PDF page 2 and result excerpt from page 1. Motivates a mutual-follow-up hypothesis; does not test it.
- [Why a Simple Act of Kindness Is Not as Simple as It Seems](https://journals.sagepub.com/doi/10.1177/0146167220949003): publisher abstract excerpts on study count and predicted compliment reception. Full methods remain unverified in this sample.
- [Some Thing to Talk About?](https://www.kumar-amit.com/s/Kumar-Gilovich-in-press-Some-Thing-to-Talk-About-PSPB.pdf): study-count excerpt from PDF page 3 and self-reported enjoyment finding from page 1. Does not demonstrate the proposed group-activity or attendance effect.

These are short source excerpts, not complete abstracts, PDFs, a human-approved gold set, or all ten Founder Central evidence cards imported into the app. Missing condition and limitation quotations remain explicitly unrecorded. The separate proposed-application text identifies key transfer limits.

The earlier full review package remains in sibling Founder Central at `research-pilot/evaluation/behavioral-social-connections/`. Its three protocols are proposals and its working need is hypothetical. This app flow does not close the authentic-need, human-review, or real-participant gates.
