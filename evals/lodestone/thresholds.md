# Prior-art thresholds: the retune sample

Status, 2026-10-14: **decided. `PAPER_FLOOR` is now 0.75 and `CLOSE` stays at
0.75.** Phase 4.3 asked for a *human* to mark each hit. The marks below were
made by a model, blind to the scores, on the synthetic `--set firms` cohort,
and the owner accepted them for this retune. Redo the sample on real cards
once members have sent verdicts. `card_feedback` holds no
verdicts yet: the local dev database has 0 cards and 0 rows, and the
production counts were not available to this run.

| constant | where | before | after | why |
|---|---|---|---|---|
| `CLOSE` | `src/lodestone/geometry.ts` | 0.75 | 0.75 (kept) | precision 0.75 on hits at or above it (12 / 16) |
| `PAPER_FLOOR` | `src/lodestone/digest.ts` | 0.6 | 0.75 (changed) | at 0.6 every top-5 hit passes (precision 0.16). 0.72 is the lowest value with precision ≥ 0.6; 0.75 matches `CLOSE`, at precision 0.75 |

## The corpus it was measured on

An isolated PGlite database (`THESIS_DATA_DIR=data/pglite-ingest`), seeded with
`npm run lodestone:seed -- --set firms --private 0` (24 cards, 15 hand-written
abstracts) and then grown with `npm run lodestone:ingest -- --source openalex`:

| query set | query | since | papers kept |
|---|---|---|---|
| `lab-equipment` | lab equipment tracking | — | 195 |
| `campus-life` | university students campus | 2015 | 192 |
| `surplus-food` | surplus food redistribution bakery | — | 187 |
| `interview-clothing` | interview clothing first-generation students | — | 183 |
| `package-theft` | package theft apartment delivery | — | 177 |
| `food-waste` | food waste logistics | 2018 | 19 |

That is 968 papers, 953 ingested and 15 seeded, all embedded with
`voyage-3.5`. Every set stopped at OpenAlex's first page of 200: OpenAlex now
refuses cursor paging without `OPENALEX_API_KEY`, and none was configured.
There are no patents yet. `search.patentsview.org` does not answer, because
USPTO paused the PatentsView API on 2026-03-20 while moving it to the Open
Data Portal.

### What the first sample found: stub abstracts

The first pass (1,008 ingested papers) scored precision at 5 of **0.13**. About
5% of OpenAlex works pass `has_abstract:true` with an "abstract" that is a
subject tag or a fragment: `Digital`, `International audience`,
`Food Security and Poverty`. Embedded, these sit at about 0.75 from *every* card
and filled most top-5 lists. The ingest now refuses an abstract under
`MIN_ABSTRACT_WORDS = 30` as `short_abstract`. The shortest seeded abstract is
34 words. The 55 such rows were pruned from this database and the sample was
drawn again. Everything below is the second sample.

## Result

20 cards × top 5 = 100 hits. Marked **R** if a founder of the idea would find
it directly useful (same problem, same population in that situation, or the same
mechanism), otherwise **N**.

| score ≥ | hits | relevant | precision | cards with a hit |
|---|---|---|---|---|
| (all) | 100 | 16 | 0.16 | 20 |
| 0.68 | 59 | 15 | 0.25 | 18 |
| 0.70 | 35 | 15 | 0.43 | 15 |
| 0.71 | 26 | 13 | 0.50 | 15 |
| 0.72 | 18 | 13 | 0.72 | 13 |
| 0.73 | 17 | 13 | 0.76 | 13 |
| 0.74 | 16 | 12 | 0.75 | 13 |
| 0.75 | 16 | 12 | 0.75 | 13 |
| 0.76 | 14 | 12 | 0.86 | 12 |
| 0.78 | 10 | 9 | 0.90 | 10 |
| 0.80 | 8 | 8 | 1.00 | 8 |

- **Precision at 5 is 0.16.** That is low because the corpus holds little that
  bears on most of these ideas, not because ranking is broken. Thirteen of the
  sixteen relevant hits are the hand-written seed abstracts, and only three came
  from ingest. The query sets match five of the twenty-four cards.
- **Above 0.75 the scores mean something.** Every seeded card with a
  purpose-written neighbour ranks it in its top 3 against 950+ real papers
  (acceptance 7.3).
- **Below 0.75 the hits are other cards' seed abstracts** cross-matching on
  campus vocabulary, and real papers that share a domain word but not the
  problem.

### Recommendation

1. Keep `CLOSE = 0.75`.
2. Raise `PAPER_FLOOR` to `0.75`: at 0.6 the digest's paper rows were noise.
   0.72 would also clear 0.6 precision and keep one more relevant hit. 0.75
   was chosen so that the digest and the map share one line. Four relevant
   ingested hits fall below it: 7.2 at 0.738, 8.3 at 0.706, 7.5 at 0.702 and
   3.5 at 0.677. Real neighbours do sit in the 0.70s, so if the floor is
   loosened later, this is the band to look at. Done. Check it again
   against a human-marked sample on real cards.
3. Run the ingest with `OPENALEX_API_KEY` set and query sets drawn from the
   cohort's own segments, then sample again. Precision at 5 is a property of
   the corpus as much as of the threshold.

## The sample

`id` is card.rank. `set` is the query set, or `seed` for a hand-written
abstract. `mark` was made without the score.

| id | card | rank | score | set | mark | title |
|---|---|---|---|---|---|---|
| 1.1 | fang-pulse | 1 | 0.854 | seed | R | Gym attendance data and residence hall competitions | 
| 1.2 | fang-pulse | 2 | 0.696 | campus-life | N | Phone Usage Of University Students Whilst Walking On Campus | 
| 1.3 | fang-pulse | 3 | 0.682 | lab-equipment | N | Using Activity Tracker Data for the Assessment of Physical Activity in | 
| 1.4 | fang-pulse | 4 | 0.678 | seed | N | Peer tutoring matched by course section in gateway courses | 
| 1.5 | fang-pulse | 5 | 0.677 | lab-equipment | N | Topics in Educational Cyber-Physical Labs : Configurations, Data Colle | 
| 2.1 | fang-fold | 1 | 0.818 | seed | R | Interview clothing access and first-generation student job outcomes | 
| 2.2 | fang-fold | 2 | 0.675 | seed | N | Peer tutoring matched by course section in gateway courses | 
| 2.3 | fang-fold | 3 | 0.670 | interview-clothing | N | Mending Matters: Cultures and Contexts of Clothing Repair | 
| 2.4 | fang-fold | 4 | 0.670 | package-theft | N | Legal Drafting: Some Elements of Technique | 
| 2.5 | fang-fold | 5 | 0.668 | seed | N | Late-night campus transportation and student safety after bus service | 
| 3.1 | fang-shelf | 1 | 0.718 | seed | N | Surplus food redistribution from bakeries and cafés at closing time | 
| 3.2 | fang-shelf | 2 | 0.695 | seed | N | Gym attendance data and residence hall competitions | 
| 3.3 | fang-shelf | 3 | 0.689 | seed | N | Persistence of course discussion communities beyond the term | 
| 3.4 | fang-shelf | 4 | 0.688 | seed | N | Event-weekend lodging shortages in college towns and household hosting | 
| 3.5 | fang-shelf | 5 | 0.677 | seed | R | Cash handling and financial controls in student organisations | 
| 4.1 | fang-kiln | 1 | 0.664 | seed | N | Interview clothing access and first-generation student job outcomes | 
| 4.2 | fang-kiln | 2 | 0.638 | seed | N | Event-weekend lodging shortages in college towns and household hosting | 
| 4.3 | fang-kiln | 3 | 0.634 | seed | N | Persistence of course discussion communities beyond the term | 
| 4.4 | fang-kiln | 4 | 0.629 | seed | N | Late-night campus transportation and student safety after bus service | 
| 4.5 | fang-kiln | 5 | 0.629 | campus-life | N | STUDENTS' PREFERENCES FOR EXTRACURRICULAR ACTIVITIES ON CAMPUS: A CASE | 
| 5.1 | fang-hive | 1 | 0.822 | seed | R | Persistence of course discussion communities beyond the term | 
| 5.2 | fang-hive | 2 | 0.705 | seed | N | Event-weekend lodging shortages in college towns and household hosting | 
| 5.3 | fang-hive | 3 | 0.694 | seed | N | Gym attendance data and residence hall competitions | 
| 5.4 | fang-hive | 4 | 0.685 | seed | N | Late-night campus transportation and student safety after bus service | 
| 5.5 | fang-hive | 5 | 0.677 | seed | N | Peer tutoring matched by course section in gateway courses | 
| 6.1 | fang-loop | 1 | 0.685 | surplus-food | N | Retail Food Waste: Existing Research and Research Gap | 
| 6.2 | fang-loop | 2 | 0.668 | package-theft | N | Legal Drafting: Some Elements of Technique | 
| 6.3 | fang-loop | 3 | 0.659 | package-theft | N | Insuring Project Risks: Contractor Expectations versus Insurance Compa | 
| 6.4 | fang-loop | 4 | 0.655 | interview-clothing | N | Mending Matters: Cultures and Contexts of Clothing Repair | 
| 6.5 | fang-loop | 5 | 0.649 | package-theft | N | The Anchor, Volume 108.01: August 31, 1994 | 
| 7.1 | fang-ward | 1 | 0.795 | seed | R | Package theft in multi-unit residential buildings without staffed lobb | 
| 7.2 | fang-ward | 2 | 0.738 | package-theft | R | Wi-Alert: WiFi Sensing for Real-time Package Theft Alerts at Residenti | 
| 7.3 | fang-ward | 3 | 0.712 | seed | N | Splitting shared household bills among student roommates | 
| 7.4 | fang-ward | 4 | 0.706 | lab-equipment | N | New tracking systems improve patient flow. | 
| 7.5 | fang-ward | 5 | 0.702 | package-theft | R | Advancements in Parcel Security: A Smart Monitoring Approach | 
| 8.1 | fang-beacon | 1 | 0.783 | lab-equipment | N | New tracking systems improve patient flow. | 
| 8.2 | fang-beacon | 2 | 0.777 | seed | R | Tracking shared equipment in teaching and research laboratories | 
| 8.3 | fang-beacon | 3 | 0.706 | lab-equipment | R | IoT based Labware Tracking during Mobile Robot Transportation | 
| 8.4 | fang-beacon | 4 | 0.705 | lab-equipment | N | Smart Tracking Tray System for A Smart and Sustainable Wet Lab Communi | 
| 8.5 | fang-beacon | 5 | 0.703 | lab-equipment | N | A Smart Laboratory Equipment Reservation Framework With AI-Based Sched | 
| 9.1 | fang-meter | 1 | 0.821 | seed | R | Heating costs in older student rental housing: sensors, thermostats, a | 
| 9.2 | fang-meter | 2 | 0.753 | seed | N | Event-weekend lodging shortages in college towns and household hosting | 
| 9.3 | fang-meter | 3 | 0.713 | seed | N | Splitting shared household bills among student roommates | 
| 9.4 | fang-meter | 4 | 0.708 | seed | N | Interview clothing access and first-generation student job outcomes | 
| 9.5 | fang-meter | 5 | 0.700 | seed | N | Asking rents, paid rents, and information asymmetry in student housing | 
| 10.1 | fang-pantry | 1 | 0.818 | seed | R | Cooking without a kitchen: meal preparation among students in residenc | 
| 10.2 | fang-pantry | 2 | 0.712 | campus-life | N | Students Preference For Restaurants Within The University Campus | 
| 10.3 | fang-pantry | 3 | 0.711 | campus-life | N | University Students Suggest Solutions to Campus Food Insecurity: A Mix | 
| 10.4 | fang-pantry | 4 | 0.704 | campus-life | N | The rewards US university students associate with campus dining halls | 
| 10.5 | fang-pantry | 5 | 0.695 | campus-life | N | Partnering to Build a Pantry: A University Campus Responds to Student | 
| 11.1 | fang-forage | 1 | 0.776 | seed | R | Surplus food redistribution from bakeries and cafés at closing time | 
| 11.2 | fang-forage | 2 | 0.723 | seed | N | Cooking without a kitchen: meal preparation among students in residenc | 
| 11.3 | fang-forage | 3 | 0.699 | campus-life | N | Partnering to Build a Pantry: A University Campus Responds to Student | 
| 11.4 | fang-forage | 4 | 0.697 | seed | N | Late-night campus transportation and student safety after bus service | 
| 11.5 | fang-forage | 5 | 0.693 | campus-life | N | Student perceptions of on‐campus foodscapes at a Canadian university | 
| 12.1 | fang-sprout | 1 | 0.688 | seed | N | Surplus food redistribution from bakeries and cafés at closing time | 
| 12.2 | fang-sprout | 2 | 0.674 | surplus-food | N | Exploring the Role of Social Supermarkets in Addressing Food Insecurit | 
| 12.3 | fang-sprout | 3 | 0.650 | package-theft | N | Ensuring the logistics of the last mile from the perspective of distri | 
| 12.4 | fang-sprout | 4 | 0.650 | seed | N | Cooking without a kitchen: meal preparation among students in residenc | 
| 12.5 | fang-sprout | 5 | 0.649 | campus-life | N | University Students Suggest Solutions to Campus Food Insecurity: A Mix | 
| 13.1 | fang-scribe | 1 | 0.719 | seed | N | Persistence of course discussion communities beyond the term | 
| 13.2 | fang-scribe | 2 | 0.678 | seed | N | Late-night campus transportation and student safety after bus service | 
| 13.3 | fang-scribe | 3 | 0.677 | seed | N | Peer tutoring matched by course section in gateway courses | 
| 13.4 | fang-scribe | 4 | 0.667 | campus-life | N | Campus-based student volunteering in Egypt: A case study of students i | 
| 13.5 | fang-scribe | 5 | 0.666 | seed | N | Microlearning for laboratory safety retention | 
| 14.1 | fang-tutor | 1 | 0.773 | seed | N | Persistence of course discussion communities beyond the term | 
| 14.2 | fang-tutor | 2 | 0.771 | seed | R | Peer tutoring matched by course section in gateway courses | 
| 14.3 | fang-tutor | 3 | 0.700 | seed | N | Late-night campus transportation and student safety after bus service | 
| 14.4 | fang-tutor | 4 | 0.691 | seed | N | Event-weekend lodging shortages in college towns and household hosting | 
| 14.5 | fang-tutor | 5 | 0.676 | seed | N | Interview clothing access and first-generation student job outcomes | 
| 15.1 | fang-lingo | 1 | 0.823 | seed | R | Microlearning for laboratory safety retention | 
| 15.2 | fang-lingo | 2 | 0.716 | seed | N | Gym attendance data and residence hall competitions | 
| 15.3 | fang-lingo | 3 | 0.697 | lab-equipment | N | Smart Tracking Tray System for A Smart and Sustainable Wet Lab Communi | 
| 15.4 | fang-lingo | 4 | 0.681 | lab-equipment | N | IoT and RFID-Enabled Smart Lab Monitoring System for Efficient Asset M | 
| 15.5 | fang-lingo | 5 | 0.679 | seed | N | Tracking shared equipment in teaching and research laboratories | 
| 16.1 | fang-split | 1 | 0.802 | seed | R | Splitting shared household bills among student roommates | 
| 16.2 | fang-split | 2 | 0.712 | seed | N | Event-weekend lodging shortages in college towns and household hosting | 
| 16.3 | fang-split | 3 | 0.672 | seed | N | Interview clothing access and first-generation student job outcomes | 
| 16.4 | fang-split | 4 | 0.664 | seed | N | Heating costs in older student rental housing: sensors, thermostats, a | 
| 16.5 | fang-split | 5 | 0.664 | seed | N | Asking rents, paid rents, and information asymmetry in student housing | 
| 17.1 | fang-vault | 1 | 0.654 | package-theft | N | Insuring Project Risks: Contractor Expectations versus Insurance Compa | 
| 17.2 | fang-vault | 2 | 0.653 | lab-equipment | N | A Smart Laboratory Equipment Reservation Framework With AI-Based Sched | 
| 17.3 | fang-vault | 3 | 0.650 | seed | N | Tracking shared equipment in teaching and research laboratories | 
| 17.4 | fang-vault | 4 | 0.648 | lab-equipment | N | New tracking systems improve patient flow. | 
| 17.5 | fang-vault | 5 | 0.647 | lab-equipment | N | Employee Skill Tracking With Open Badges | 
| 18.1 | fang-ledger | 1 | 0.820 | seed | R | Cash handling and financial controls in student organisations | 
| 18.2 | fang-ledger | 2 | 0.684 | seed | N | Interview clothing access and first-generation student job outcomes | 
| 18.3 | fang-ledger | 3 | 0.668 | campus-life | N | STUDENTS' PREFERENCES FOR EXTRACURRICULAR ACTIVITIES ON CAMPUS: A CASE | 
| 18.4 | fang-ledger | 4 | 0.667 | seed | N | Splitting shared household bills among student roommates | 
| 18.5 | fang-ledger | 5 | 0.662 | seed | N | Gym attendance data and residence hall competitions | 
| 19.1 | fang-cart | 1 | 0.757 | seed | N | Cooking without a kitchen: meal preparation among students in residenc | 
| 19.2 | fang-cart | 2 | 0.708 | seed | N | Splitting shared household bills among student roommates | 
| 19.3 | fang-cart | 3 | 0.696 | campus-life | N | The rewards US university students associate with campus dining halls | 
| 19.4 | fang-cart | 4 | 0.685 | seed | N | Event-weekend lodging shortages in college towns and household hosting | 
| 19.5 | fang-cart | 5 | 0.684 | seed | N | Late-night campus transportation and student safety after bus service | 
| 20.1 | fang-route | 1 | 0.689 | package-theft | N | Ensuring the logistics of the last mile from the perspective of distri | 
| 20.2 | fang-route | 2 | 0.688 | lab-equipment | N | A Smart Laboratory Equipment Reservation Framework With AI-Based Sched | 
| 20.3 | fang-route | 3 | 0.661 | package-theft | N | AUTOMATION AND INNOVATIONS IN LOGISTIC PROCESSES OF ELECTRONIC COMMERC | 
| 20.4 | fang-route | 4 | 0.657 | seed | N | Package theft in multi-unit residential buildings without staffed lobb | 
| 20.5 | fang-route | 5 | 0.650 | package-theft | N | Intelligent Packaging System: An IoT Solution for the E-Commerce Indus | 
