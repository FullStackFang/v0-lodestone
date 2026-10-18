# Eval run 2026-10-16 — baseline-check

Embedder `voyage-3.5`; corpus 1039 documents with a vector (953 distractors listed); card search off (`--no-search`); field quota off (`--no-quota`); purposes off; database `data/pglite-eval`.

```
cards scored     30 of 30
precision at 5   0.207
recall at 10     0.517
MRR              0.502
fields in top 10 4.63
wrong-block hits 18
```

| card | field | P@5 | R@10 | RR | fields | wrong-block |
|---|---|---|---|---|---|---|
| pulse | Health Professions | 0.200 | 0.667 | 0.333 | 5 | 0 |
| fold | Social Sciences | 0.400 | 0.667 | 1.000 | 3 | 1 |
| shelf | Business, Management and Accounting | 0.200 | 1.000 | 1.000 | 6 | 1 |
| kiln | Business, Management and Accounting | 0.200 | 0.667 | 1.000 | 5 | 1 |
| hive | Social Sciences | 0.200 | 0.333 | 1.000 | 4 | 1 |
| loop | Social Sciences | 0.600 | 1.000 | 0.500 | 5 | 3 |
| ward | Social Sciences | 0.000 | 0.333 | 0.111 | 3 | 0 |
| beacon | Engineering | 0.000 | 0.250 | 0.125 | 4 | 1 |
| meter | Energy | 0.600 | 1.000 | 1.000 | 5 | 1 |
| pantry | Business, Management and Accounting | 0.000 | 0.333 | 0.125 | 3 | 0 |
| forage | Environmental Science | 0.000 | 0.000 | 0.000 | 4 | 0 |
| sprout | Social Sciences | 0.600 | 0.600 | 0.500 | 4 | 0 |
| scribe | Social Sciences | 0.000 | 0.500 | 0.167 | 3 | 1 |
| tutor | Social Sciences | 0.200 | 0.250 | 0.333 | 3 | 1 |
| lingo | Social Sciences | 0.600 | 1.000 | 1.000 | 5 | 1 |
| split | Economics, Econometrics and Finance | 0.200 | 0.333 | 1.000 | 6 | 0 |
| vault | Computer Science | 0.200 | 0.500 | 1.000 | 5 | 0 |
| ledger | Business, Management and Accounting | 0.200 | 0.333 | 1.000 | 8 | 0 |
| cart | Business, Management and Accounting | 0.200 | 0.250 | 0.500 | 5 | 1 |
| route | Business, Management and Accounting | 0.400 | 0.500 | 0.333 | 4 | 1 |
| swap | Social Sciences | 0.200 | 0.500 | 0.500 | 9 | 0 |
| nook | Social Sciences | 0.200 | 1.000 | 0.500 | 5 | 1 |
| spin | Business, Management and Accounting | 0.200 | 1.000 | 0.500 | 3 | 1 |
| preflight | Social Sciences | 0.000 | 0.000 | 0.000 | 7 | 0 |
| dawn | Social Sciences | 0.000 | 0.500 | 0.111 | 4 | 0 |
| slice | Social Sciences | 0.000 | 0.000 | 0.000 | 2 | 0 |
| hush | Social Sciences | 0.000 | 0.000 | 0.000 | 5 | 0 |
| tumbler | Business, Management and Accounting | 0.400 | 1.000 | 1.000 | 6 | 0 |
| chill | Business, Management and Accounting | 0.000 | 0.500 | 0.167 | 3 | 1 |
| movein | Social Sciences | 0.200 | 0.500 | 0.250 | 5 | 1 |

## pulse

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | distractor | 0.696 | Value proposition | Social Sciences | Phone Usage Of University Students Whilst Walking On Campus |
| 2 | distractor | 0.682 | Value proposition | Medicine | Using Activity Tracker Data for the Assessment of Physical Activity in Public Health Studi |
| 3 | relevant | 0.680 | Value proposition | Psychology | Effectiveness of Behaviorally Designed Gamification Interventions With Social Incentives f |
| 4 | distractor | 0.677 | Value proposition | Engineering | Topics in Educational Cyber-Physical Labs : Configurations, Data Collection and Analysis |
| 5 | distractor | 0.661 | Value proposition | Medicine | Smart Telemedicine Services for Students on University Campus and in Jogging Areas |
| 6 | relevant | 0.660 | Value proposition | Psychology | Evaluating the Effectiveness of Gamification on Physical Activity: Systematic Review and M |
| 7 | distractor | 0.655 | Value proposition | Psychology | Gamification as a Tool for Enhancing University Students’ Campus Adaptation: the YUNIPEER  |
| 8 | distractor | 0.650 | Value proposition | Computer Science | Social Frequency Analysis of University Students via Digital Campus Cards |
| 9 | distractor | 0.649 | Value proposition | Medicine | A Comparison of Physical Activity Levels between On-Line and Campus University Students |
| 10 | distractor | 0.648 | Value proposition | Social Sciences | Physics Lab Toolbox - Collisions Lab |

Marked, not in the top ten: W2561749168 (customer_segments).

## fold

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | wrong-block | 0.703 | Customer segments | Social Sciences | Closing the Gap between College Students’ Professional Attire Needs and Career Readiness |
| 2 | distractor | 0.670 | Key activities, Cost structure, Customer segments | Arts and Humanities | Mending Matters: Cultures and Contexts of Clothing Repair |
| 3 | distractor | 0.670 | Customer segments | Social Sciences | Legal Drafting: Some Elements of Technique |
| 4 | relevant | 0.660 | Customer segments | Social Sciences | Access to business attire as a widening participation issue in UK law schools |
| 5 | distractor | 0.660 | Channels | Social Sciences | Campus-based student volunteering in Egypt: A case study of students in a private universi |
| 6 | distractor | 0.656 | Customer segments | Business, Management and Accounting | The relationship between the first impression that dress creates and college students’ rea |
| 7 | distractor | 0.654 | Channels | Social Sciences | Mapping their Road to University: First-Generation Students’ Choice and Decision of Univer |
| 8 | distractor | 0.648 | Channels | Social Sciences | Faculty as Student Case Managers Bridging Capital Gap: Faculty as Academic and Life Case M |
| 9 | distractor | 0.641 | Channels | Social Sciences | Perceived Factors Influencing the Pursuit of Higher Education among First-Generation Colle |
| 10 | distractor | 0.639 | Channels | Social Sciences | The Underprepared and Underrepresented: Perceptions and Experiences of Self-Efficacy on Co |

Marked, not in the top ten: W2568401417 (value_proposition).

## shelf

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | relevant | 0.659 | Customer segments, Value proposition | Business, Management and Accounting | Temporary store, lasting impact : Developing a framework and a research agenda for pop-up  |
| 2 | distractor | 0.657 | Channels | Social Sciences | STUDENTS' PREFERENCES FOR EXTRACURRICULAR ACTIVITIES ON CAMPUS: A CASE STUDY AT VINH UNIVE |
| 3 | unmarked | 0.652 | Customer segments | Arts and Humanities | Handmade online: the crafting of commerce, aesthetics and community on Etsy.com |
| 4 | distractor | 0.638 | Cost structure, Customer segments, Channels, Relationships | Social Sciences | Phone Usage Of University Students Whilst Walking On Campus |
| 5 | distractor | 0.635 | Cost structure | Health Professions | New tracking systems improve patient flow. |
| 6 | distractor | 0.625 | Cost structure | Engineering | Wi-Alert: WiFi Sensing for Real-time Package Theft Alerts at Residential Doorsteps |
| 7 | wrong-block | 0.620 | Cost structure | Business, Management and Accounting | Exploring merchants’ adoption of mobile payments A qualitative study on Swedish merchants’ |
| 8 | distractor | 0.620 | Cost structure, Revenue streams, Channels | Decision Sciences | Insuring Project Risks: Contractor Expectations versus Insurance Company Policies |
| 9 | unmarked | 0.617 | Customer segments | Business, Management and Accounting | Crafting consumption through community: An exploration of the Etsy experience |
| 10 | distractor | 0.617 | Cost structure | Social Sciences | Cybersecurity, Identity Theft, and the Limits of Tort Liability |

## kiln

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | relevant | 0.676 | Value proposition | Arts and Humanities | Handmade online: the crafting of commerce, aesthetics and community on Etsy.com |
| 2 | distractor | 0.629 | Customer segments | Social Sciences | STUDENTS' PREFERENCES FOR EXTRACURRICULAR ACTIVITIES ON CAMPUS: A CASE STUDY AT VINH UNIVE |
| 3 | distractor | 0.625 | Cost structure | Decision Sciences | Insuring Project Risks: Contractor Expectations versus Insurance Company Policies |
| 4 | distractor | 0.620 | Cost structure, Customer segments, Key activities | Social Sciences | Phone Usage Of University Students Whilst Walking On Campus |
| 5 | distractor | 0.618 | Relationships, Revenue streams, Cost structure | Social Sciences | Legal Drafting: Some Elements of Technique |
| 6 | wrong-block | 0.617 | Value proposition, Customer segments | Business, Management and Accounting | Crafting consumption through community: An exploration of the Etsy experience |
| 7 | distractor | 0.614 | Customer segments | Social Sciences | Students as colleagues: The impact of working on campus on students and their attitudes to |
| 8 | distractor | 0.613 | Relationships, Customer segments, Value proposition, Key activities, Revenue streams | Arts and Humanities | Mending Matters: Cultures and Contexts of Clothing Repair |
| 9 | distractor | 0.604 | Customer segments, Key activities | Psychology | Employee Skill Tracking With Open Badges |
| 10 | unmarked | 0.604 | Relationships | Business, Management and Accounting | Decision Bias in the Newsvendor Problem with a Known Demand Distribution: Experimental Evi |

Marked, not in the top ten: W3093817711 (channels).

## hive

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | wrong-block | 0.670 | Relationships | Social Sciences | Student Actions and Community in Online Courses: The Roles Played By Course Length and Fac |
| 2 | distractor | 0.649 | Relationships, Value proposition | Engineering | Non-Traditional Labs and Lab Network Initiatives: A Review |
| 3 | distractor | 0.645 | Value proposition, Relationships | Social Sciences | Impact of Satellite Campuses on Undergraduate Student Experience in Comparison to Big Univ |
| 4 | distractor | 0.642 | Customer segments | Social Sciences | Phone Usage Of University Students Whilst Walking On Campus |
| 5 | distractor | 0.638 | Relationships, Key partners | Social Sciences | Belonging, the physical space of the university campus and how it is perceived by students |
| 6 | distractor | 0.638 | Relationships, Key activities | Computer Science | A Smart Laboratory Equipment Reservation Framework With AI-Based Scheduling And Performanc |
| 7 | distractor | 0.637 | Relationships, Key activities | Engineering | Digital Lab |
| 8 | distractor | 0.634 | Channels, Cost structure | Social Sciences | Legal Drafting: Some Elements of Technique |
| 9 | distractor | 0.630 | Value proposition, Relationships | Social Sciences | Culture Clash: New Majority Students at PSU |
| 10 | distractor | 0.630 | Cost structure | Decision Sciences | Insuring Project Risks: Contractor Expectations versus Insurance Company Policies |

Marked, not in the top ten: W2983543780 (value_proposition); W4214811271 (value_proposition).

## loop

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | distractor | 0.686 | Channels, Value proposition | Agricultural and Biological Sciences | Retail Food Waste: Existing Research and Research Gap |
| 2 | wrong-block | 0.669 | Channels | Decision Sciences | Science blogs and public engagement with science: practices, challenges, and opportunities |
| 3 | distractor | 0.668 | Customer segments, Cost structure | Social Sciences | Legal Drafting: Some Elements of Technique |
| 4 | wrong-block | 0.666 | Channels | Decision Sciences | Enhancing Graduate Student Communication to General Audiences through Blogging about Nanot |
| 5 | wrong-block | 0.662 | Value proposition, Relationships | Social Sciences | Substack, the New “Home” for Cultural Journalism |
| 6 | distractor | 0.659 | Cost structure | Decision Sciences | Insuring Project Risks: Contractor Expectations versus Insurance Company Policies |
| 7 | distractor | 0.655 | Cost structure | Arts and Humanities | Mending Matters: Cultures and Contexts of Clothing Repair |
| 8 | distractor | 0.649 | Relationships, Channels | Social Sciences | The Anchor, Volume 108.01: August 31, 1994 |
| 9 | unmarked | 0.639 | Key partners | Chemical Engineering | Student Involvement in Improving the Culture of Safety in Academic Laboratories |
| 10 | distractor | 0.636 | Channels, Customer segments | Social Sciences | Phone Usage Of University Students Whilst Walking On Campus |

## ward

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | distractor | 0.739 | Key activities | Engineering | Wi-Alert: WiFi Sensing for Real-time Package Theft Alerts at Residential Doorsteps |
| 2 | distractor | 0.705 | Key activities | Health Professions | New tracking systems improve patient flow. |
| 3 | distractor | 0.702 | Key activities | Engineering | Advancements in Parcel Security: A Smart Monitoring Approach |
| 4 | distractor | 0.699 | Key activities | Engineering | Smart Parcel Delivery Receiving Box for Secure Parcel Drop-Off |
| 5 | distractor | 0.685 | Key activities, Value proposition | Engineering | “SK@D” Smart Kit at Door - Internet of Things (IoT) Based Smart System Enabling Notificati |
| 6 | distractor | 0.676 | Value proposition, Key activities | Engineering | Simulating the Effectiveness of an IoT Parcel Alert System for Enhancing Delivery Efficien |
| 7 | distractor | 0.673 | Key activities | Engineering | IoT and RFID-Enabled Smart Lab Monitoring System for Efficient Asset Management |
| 8 | distractor | 0.669 | Key activities | Computer Science | YOLO Based IoT Tracking for Academic Labs on Raspberry Pi |
| 9 | relevant | 0.665 | Key activities, Value proposition | Engineering | Securing E-Commerce Deliveries: An Integrated Mobile Application and Parcel Locker System  |
| 10 | distractor | 0.663 | Key activities, Value proposition | Engineering | Last Mile and its Latest Changes in Express, Courier and Postal Services Bound to E-commer |

Marked, not in the top ten: W4394597468 (key_resources); W2962912345 (value_proposition).

## beacon

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | distractor | 0.783 | Value proposition | Health Professions | New tracking systems improve patient flow. |
| 2 | distractor | 0.706 | Value proposition | Engineering | IoT based Labware Tracking during Mobile Robot Transportation |
| 3 | distractor | 0.704 | Value proposition | Engineering | Smart Tracking Tray System for A Smart and Sustainable Wet Lab Community |
| 4 | distractor | 0.703 | Relationships | Computer Science | A Smart Laboratory Equipment Reservation Framework With AI-Based Scheduling And Performanc |
| 5 | distractor | 0.701 | Value proposition | Engineering | Indoor Tracking of Construction Workers Using BLE: Mobile Beacons and Fixed Gateways vs. F |
| 6 | distractor | 0.694 | Value proposition, Relationships | Engineering | IoT and RFID-Enabled Smart Lab Monitoring System for Efficient Asset Management |
| 7 | unmarked | 0.691 | Customer segments, Key partners | Chemical Engineering | Student Involvement in Improving the Culture of Safety in Academic Laboratories |
| 8 | wrong-block | 0.685 | Cost structure, Value proposition | Engineering | Real Time Asset Tracking using BLE Beacons |
| 9 | distractor | 0.676 | Value proposition | Computer Science | YOLO Based IoT Tracking for Academic Labs on Raspberry Pi |
| 10 | distractor | 0.675 | Relationships, Customer segments | Engineering | Non-Traditional Labs and Lab Network Initiatives: A Review |

Marked, not in the top ten: W1526379198 (key_activities); W4410400489 (value_proposition); W2964029185 (key_resources).

## meter

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | wrong-block | 0.710 | Key partners | Environmental Science | Drawing On College Student Attitudes and Behaviors to Instigate Energy Efficiency Improvem |
| 2 | relevant | 0.707 | Value proposition | Computer Science | Facilitating energy savings with programmable thermostats: evaluation and guidelines for t |
| 3 | relevant | 0.688 | Value proposition | Engineering | Do domestic heating controls save energy? A review of the evidence |
| 4 | distractor | 0.672 | Key activities, Cost structure | Decision Sciences | Insuring Project Risks: Contractor Expectations versus Insurance Company Policies |
| 5 | distractor | 0.665 | Customer segments, Key partners | Engineering | Innovative Policy Schemes to Promote Renovation of Multi-Flat Residential Buildings and Ad |
| 6 | distractor | 0.663 | Key activities, Value proposition | Engineering | IoT and RFID-Enabled Smart Lab Monitoring System for Efficient Asset Management |
| 7 | distractor | 0.661 | Key activities | Engineering | An efficient and improved model for power theft detection in Pakistan |
| 8 | distractor | 0.652 | Channels | Health Professions | Partnering to Build a Pantry: A University Campus Responds to Student Food Insecurity |
| 9 | distractor | 0.650 | Key activities | Computer Science | LAB COMPLAINT CLEARANCE |
| 10 | distractor | 0.648 | Key activities, Value proposition, Cost structure | Health Professions | New tracking systems improve patient flow. |

## pantry

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | distractor | 0.712 | Customer segments | Business, Management and Accounting | Students Preference For Restaurants Within The University Campus |
| 2 | distractor | 0.710 | Customer segments | Health Professions | University Students Suggest Solutions to Campus Food Insecurity: A Mixed Methods Study |
| 3 | distractor | 0.704 | Customer segments | Nursing | The rewards US university students associate with campus dining halls and food choices |
| 4 | distractor | 0.695 | Customer segments | Health Professions | Partnering to Build a Pantry: A University Campus Responds to Student Food Insecurity |
| 5 | distractor | 0.689 | Customer segments | Health Professions | Student perceptions of on‐campus foodscapes at a Canadian university |
| 6 | unmarked | 0.675 | Customer segments | Health Professions | Food Insecure College Students and Objective Measurements of Their Unused Meal Plans |
| 7 | distractor | 0.671 | Customer segments | Health Professions | Food Insecurity Among Midwestern University Students Living Off Campus |
| 8 | relevant | 0.671 | Customer segments, Value proposition | Nursing | College Student Health: How Cooking Can Promote Nutrition and a Healthy Diet |
| 9 | distractor | 0.669 | Customer segments | Nursing | On‐campus food purchasing behaviours and satisfaction of Australian university students |
| 10 | distractor | 0.666 | Customer segments | Nursing | Eating Behavior of Students in Relation to the Offer Available in the Vicinity of the Univ |

Marked, not in the top ten: W2943039458 (value_proposition); W4402926586 (customer_segments).

## forage

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | distractor | 0.699 | Customer segments | Health Professions | Partnering to Build a Pantry: A University Campus Responds to Student Food Insecurity |
| 2 | distractor | 0.692 | Customer segments | Health Professions | Student perceptions of on‐campus foodscapes at a Canadian university |
| 3 | distractor | 0.690 | Customer segments | Nursing | The rewards US university students associate with campus dining halls and food choices |
| 4 | distractor | 0.684 | Customer segments | Nursing | Eating Behavior of Students in Relation to the Offer Available in the Vicinity of the Univ |
| 5 | distractor | 0.680 | Customer segments | Health Professions | University Students Suggest Solutions to Campus Food Insecurity: A Mixed Methods Study |
| 6 | distractor | 0.679 | Customer segments | Nursing | On‐campus food purchasing behaviours and satisfaction of Australian university students |
| 7 | distractor | 0.661 | Customer segments | Business, Management and Accounting | Students Preference For Restaurants Within The University Campus |
| 8 | distractor | 0.654 | Customer segments | Health Professions | Food Insecurity Among Midwestern University Students Living Off Campus |
| 9 | distractor | 0.653 | Key activities, Relationships | Engineering | Ensuring the logistics of the last mile from the perspective of distribution companies |
| 10 | distractor | 0.648 | Customer segments | Health Professions | Student Food Insecurity Campus Readiness Assessment: An Analysis of Campus Responses to St |

Marked, not in the top ten: W4282981913 (value_proposition); W4389204742 (revenue_streams); W4399812445 (customer_segments); W4366748213 (channels).

## sprout

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | distractor | 0.674 | Customer segments | Health Professions | Exploring the Role of Social Supermarkets in Addressing Food Insecurity and Food Waste: A  |
| 2 | relevant | 0.655 | Customer segments | Health Professions | Serving Homebound Seniors: In-Home Senior Farmers’ Market Nutrition Program Enrollment and |
| 3 | relevant | 0.654 | Customer segments | Health Professions | Systematic Review of Factors Influencing Farmers’ Market Use Overall and among Low-Income  |
| 4 | relevant | 0.654 | Customer segments | Health Professions | Low-income adults’ perceptions of farmers’ markets and community-supported agriculture pro |
| 5 | distractor | 0.651 | Key activities, Cost structure, Customer segments, Revenue streams | Engineering | Ensuring the logistics of the last mile from the perspective of distribution companies |
| 6 | distractor | 0.649 | Customer segments | Health Professions | University Students Suggest Solutions to Campus Food Insecurity: A Mixed Methods Study |
| 7 | unmarked | 0.645 | Revenue streams | Business, Management and Accounting | Posted Price versus Hybrid Mechanisms in Freight Transportation Marketplaces |
| 8 | unmarked | 0.640 | Key activities, Customer segments, Relationships | Engineering | Navigating the Last Mile: The Demand Effects of Click-and-Collect Order Fulfillment |
| 9 | distractor | 0.636 | Customer segments | Agricultural and Biological Sciences | From Food Waste to Donations: The Case of Marketplaces in Northern Spain |
| 10 | distractor | 0.635 | Customer segments | Agricultural and Biological Sciences | Avoidance of Food Waste from a Grocery Retail Store Owner’s Perspective |

Marked, not in the top ten: W4318476975 (key_activities); W2084924967 (cost_structure).

## scribe

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | distractor | 0.667 | Channels | Social Sciences | Campus-based student volunteering in Egypt: A case study of students in a private universi |
| 2 | distractor | 0.664 | Key activities, Cost structure, Value proposition | Social Sciences | Legal Drafting: Some Elements of Technique |
| 3 | distractor | 0.650 | Cost structure, Customer segments, Relationships | Social Sciences | Phone Usage Of University Students Whilst Walking On Campus |
| 4 | distractor | 0.644 | Key partners, Value proposition | Arts and Humanities | Phat Beats, Dope Rhymes: Hip Hop Down Under Comin' Upper |
| 5 | distractor | 0.644 | Value proposition | Engineering | Putting labs online with Web services |
| 6 | wrong-block | 0.635 | Channels, Customer segments | Social Sciences | Accommodations and academic performance: First-year university students with disabilities |
| 7 | distractor | 0.634 | Customer segments | Social Sciences | Student Satisfaction at Utah State University Regional Campuses |
| 8 | distractor | 0.629 | Value proposition | Engineering | VIRTUAL LAB |
| 9 | distractor | 0.626 | Value proposition | Engineering | Virtual Lab |
| 10 | distractor | 0.620 | Customer segments | Social Sciences | First-Generation Student Success After Academic Warning: An Exploratory Analysis of Academ |

Marked, not in the top ten: W1911466876 (customer_segments).

## tutor

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | distractor | 0.672 | Customer segments | Social Sciences | An exploratory study of students with dyslexia in a mixed online and on-campus environment |
| 2 | distractor | 0.669 | Customer segments | Social Sciences | Academic performance of low SES students at an Australian university satellite campus |
| 3 | wrong-block | 0.669 | Customer segments | Social Sciences | How do peer mentors impact college students in undergraduate gateway courses at a large pu |
| 4 | distractor | 0.667 | Cost structure, Relationships | Social Sciences | Legal Drafting: Some Elements of Technique |
| 5 | distractor | 0.666 | Key activities | Computer Science | A Smart Laboratory Equipment Reservation Framework With AI-Based Scheduling And Performanc |
| 6 | unmarked | 0.657 | Channels | Social Sciences | Student Actions and Community in Online Courses: The Roles Played By Course Length and Fac |
| 7 | distractor | 0.648 | Customer segments | Social Sciences | Opinion & Special Articles: Examining the Hidden Curriculum of Medical School From a First |
| 8 | distractor | 0.647 | Customer segments | Social Sciences | The Underprepared and Underrepresented: Perceptions and Experiences of Self-Efficacy on Co |
| 9 | distractor | 0.644 | Customer segments | Social Sciences | The Revolving Door of Education: Retaining First-Generation Latinx Students during the Fir |
| 10 | distractor | 0.643 | Cost structure, Customer segments | Decision Sciences | Insuring Project Risks: Contractor Expectations versus Insurance Company Policies |

Marked, not in the top ten: W7165850525 (relationships); W2961378765 (value_proposition); W4406816944 (value_proposition).

## lingo

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | relevant | 0.726 | Value proposition | Health Professions | Microlearning the Safe Way: Why Short, Sharp Training Beats Marathon Sessions |
| 2 | relevant | 0.715 | Value proposition | Chemical Engineering | Effects of Different Safety Training Methods on Students’ Unsafe Behavior in the Laborator |
| 3 | wrong-block | 0.711 | Value proposition | Chemical Engineering | Student Involvement in Improving the Culture of Safety in Academic Laboratories |
| 4 | distractor | 0.697 | Relationships | Engineering | Smart Tracking Tray System for A Smart and Sustainable Wet Lab Community |
| 5 | distractor | 0.681 | Relationships | Engineering | IoT and RFID-Enabled Smart Lab Monitoring System for Efficient Asset Management |
| 6 | distractor | 0.678 | Key activities | Computer Science | LAB COMPLAINT CLEARANCE |
| 7 | distractor | 0.672 | Key activities | Decision Sciences | Insuring Project Risks: Contractor Expectations versus Insurance Company Policies |
| 8 | distractor | 0.668 | Relationships | Computer Science | A Smart Laboratory Equipment Reservation Framework With AI-Based Scheduling And Performanc |
| 9 | distractor | 0.666 | Value proposition | Chemical Engineering | Leading Change in Your Lab Safety Culture |
| 10 | distractor | 0.665 | Relationships | Computer Science | Blockchain Integration for Mixed Reality Based Smart Lab Systems |

## split

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | relevant | 0.649 | Customer segments | Social Sciences | Shared living, shared burdens: A case of the university of Venda exploring the impact of c |
| 2 | distractor | 0.633 | Cost structure, Channels, Customer segments | Decision Sciences | Insuring Project Risks: Contractor Expectations versus Insurance Company Policies |
| 3 | distractor | 0.633 | Channels, Customer segments | Social Sciences | Phone Usage Of University Students Whilst Walking On Campus |
| 4 | distractor | 0.630 | Customer segments | Engineering | Carsharing in Europe and North American: Past, Present, and Future |
| 5 | distractor | 0.625 | Cost structure | Computer Science | D2.2 ONTOCHAIN OPEN CALL 2 SPECIFICATIONS AND LAUNCH PACKAGE DOCUMENTS |
| 6 | distractor | 0.623 | Customer segments | Engineering | A SHORT HISTORY OF CARSHARING IN THE 90'S |
| 7 | distractor | 0.619 | Cost structure | Health Professions | New tracking systems improve patient flow. |
| 8 | unmarked | 0.618 | Customer segments, Channels | Environmental Science | Drawing On College Student Attitudes and Behaviors to Instigate Energy Efficiency Improvem |
| 9 | distractor | 0.617 | Cost structure | Engineering | AUTOMATION AND INNOVATIONS IN LOGISTIC PROCESSES OF ELECTRONIC COMMERCE |
| 10 | distractor | 0.616 | Key partners, Cost structure | Social Sciences | Cybersecurity, Identity Theft, and the Limits of Tort Liability |

Marked, not in the top ten: W3113688461 (value_proposition); W4417003607 (value_proposition).

## vault

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | relevant | 0.659 | Customer segments, Cost structure | Computer Science | Addressing the Cybersecurity Issues and Needs of Rural Pennsylvania Nonprofit Organization |
| 2 | distractor | 0.654 | Cost structure, Key activities, Value proposition | Decision Sciences | Insuring Project Risks: Contractor Expectations versus Insurance Company Policies |
| 3 | distractor | 0.653 | Key activities, Value proposition | Computer Science | A Smart Laboratory Equipment Reservation Framework With AI-Based Scheduling And Performanc |
| 4 | distractor | 0.648 | Value proposition, Key activities | Health Professions | New tracking systems improve patient flow. |
| 5 | distractor | 0.647 | Key activities, Value proposition | Psychology | Employee Skill Tracking With Open Badges |
| 6 | distractor | 0.645 | Value proposition | Computer Science | Labtrack: A Comprehensive Approach to Attendance Tracking Computer Usage Monitoring - The  |
| 7 | distractor | 0.644 | Cost structure | Computer Science | On-premise cloud computing : deploying a private cloud infrastructure with Ubuntu Server 1 |
| 8 | distractor | 0.643 | Value proposition | Engineering | IoT and RFID-Enabled Smart Lab Monitoring System for Efficient Asset Management |
| 9 | distractor | 0.638 | Value proposition | Engineering | Exploring strengths and weaknesses: A case study after developing a remote network lab |
| 10 | relevant | 0.633 | Value proposition | Computer Science | Understanding Mental Models of Password Managers |

Marked, not in the top ten: W4385234803 (customer_segments); W2471998880 (value_proposition).

## ledger

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | relevant | 0.686 | Customer segments | Business, Management and Accounting | Exploration of Financial Management Operation of Political and Non-Political Student Organ |
| 2 | distractor | 0.668 | Channels | Social Sciences | STUDENTS' PREFERENCES FOR EXTRACURRICULAR ACTIVITIES ON CAMPUS: A CASE STUDY AT VINH UNIVE |
| 3 | distractor | 0.660 | Cost structure, Revenue streams | Decision Sciences | Insuring Project Risks: Contractor Expectations versus Insurance Company Policies |
| 4 | distractor | 0.642 | Channels | Social Sciences | Phone Usage Of University Students Whilst Walking On Campus |
| 5 | distractor | 0.631 | Channels | Agricultural and Biological Sciences | Retail Food Waste: Existing Research and Research Gap |
| 6 | distractor | 0.630 | Channels | Arts and Humanities | Discipling Students on Non-Adventist College and University Campuses |
| 7 | distractor | 0.627 | Channels, Cost structure | Social Sciences | Legal Drafting: Some Elements of Technique |
| 8 | distractor | 0.626 | Channels, Key activities | Psychology | Employee Skill Tracking With Open Badges |
| 9 | distractor | 0.615 | Revenue streams, Cost structure, Key activities | Computer Science | D2.2 ONTOCHAIN OPEN CALL 2 SPECIFICATIONS AND LAUNCH PACKAGE DOCUMENTS |
| 10 | unmarked | 0.614 | Channels | Chemical Engineering | Student Involvement in Improving the Culture of Safety in Academic Laboratories |

Marked, not in the top ten: W4411840570 (value_proposition); W3084148495 (value_proposition).

## cart

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | distractor | 0.697 | Channels, Value proposition, Revenue streams | Nursing | The rewards US university students associate with campus dining halls and food choices |
| 2 | wrong-block | 0.673 | Customer segments, Revenue streams | Health Professions | Food Insecure College Students and Objective Measurements of Their Unused Meal Plans |
| 3 | distractor | 0.672 | Revenue streams, Channels, Value proposition | Business, Management and Accounting | Students Preference For Restaurants Within The University Campus |
| 4 | distractor | 0.670 | Value proposition, Channels | Agricultural and Biological Sciences | ADVANCED FOOD WASTAGE MANAGEMENT SYSTEM |
| 5 | distractor | 0.670 | Channels | Health Professions | New tracking systems improve patient flow. |
| 6 | distractor | 0.669 | Value proposition, Channels | Agricultural and Biological Sciences | FOOD WASTAGE MANAGEMENT SYSTEM |
| 7 | distractor | 0.663 | Customer segments, Revenue streams, Channels | Health Professions | University Students Suggest Solutions to Campus Food Insecurity: A Mixed Methods Study |
| 8 | distractor | 0.661 | Revenue streams, Customer segments, Value proposition | Health Professions | Partnering to Build a Pantry: A University Campus Responds to Student Food Insecurity |
| 9 | distractor | 0.654 | Key activities | Engineering | Ensuring the logistics of the last mile from the perspective of distribution companies |
| 10 | distractor | 0.651 | Channels | Agricultural and Biological Sciences | Mealbridge: A Web-Based Social Impact System for Food Recovery and Community Hunger Mitiga |

Marked, not in the top ten: W2227466887 (customer_segments); W4410240862 (value_proposition); W4409471007 (customer_segments).

## route

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | distractor | 0.690 | Key activities | Engineering | Ensuring the logistics of the last mile from the perspective of distribution companies |
| 2 | distractor | 0.687 | Cost structure | Computer Science | A Smart Laboratory Equipment Reservation Framework With AI-Based Scheduling And Performanc |
| 3 | relevant | 0.677 | Revenue streams | Business, Management and Accounting | Posted Price versus Hybrid Mechanisms in Freight Transportation Marketplaces |
| 4 | wrong-block | 0.665 | Key partners, Key activities | Business, Management and Accounting | Freight Transportation Electronic Marketplaces: A Survey of the Industry and Exploration o |
| 5 | distractor | 0.661 | Key activities | Engineering | AUTOMATION AND INNOVATIONS IN LOGISTIC PROCESSES OF ELECTRONIC COMMERCE |
| 6 | distractor | 0.650 | Key activities | Engineering | Intelligent Packaging System: An IoT Solution for the E-Commerce Industry |
| 7 | distractor | 0.650 | Key activities | Engineering | PILOT: Piloting the last 100 yards |
| 8 | distractor | 0.650 | Key activities | Engineering | Intelligent Packaging System |
| 9 | distractor | 0.649 | Key activities | Business, Management and Accounting | Packaging logistics at Schenker - a study of possibilities and advantages |
| 10 | distractor | 0.649 | Cost structure, Key activities, Relationships | Health Professions | New tracking systems improve patient flow. |

Marked, not in the top ten: W3022623343 (value_proposition); W4224011787 (key_activities).

## swap

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | distractor | 0.689 | Cost structure | Decision Sciences | Insuring Project Risks: Contractor Expectations versus Insurance Company Policies |
| 2 | relevant | 0.660 | Key activities | Economics, Econometrics and Finance | House Allocation with Existing Tenants |
| 3 | distractor | 0.638 | Key activities | Engineering | PILOT: Piloting the last 100 yards |
| 4 | unmarked | 0.637 | Key activities | Business, Management and Accounting | Posted Price versus Hybrid Mechanisms in Freight Transportation Marketplaces |
| 5 | distractor | 0.630 | Channels, Key activities | Computer Science | A Smart Laboratory Equipment Reservation Framework With AI-Based Scheduling And Performanc |
| 6 | distractor | 0.628 | Key activities | Engineering | A sustainable crowd shipping model using public transport for low-carbon urban logistics |
| 7 | distractor | 0.628 | Channels, Relationships, Revenue streams | Arts and Humanities | Phat Beats, Dope Rhymes: Hip Hop Down Under Comin' Upper |
| 8 | distractor | 0.625 | Cost structure | Agricultural and Biological Sciences | Food Redistribution in the Nordic Region |
| 9 | unmarked | 0.621 | Key activities | Health Professions | A stochastic overbooking model for outpatient clinical scheduling with no-shows |
| 10 | distractor | 0.620 | Channels, Customer segments | Social Sciences | Exploring Student Satisfaction with in-Campus Accommodation in Public Universities |

Marked, not in the top ten: W4242907262 (value_proposition).

## nook

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | distractor | 0.722 | Cost structure | Health Professions | New tracking systems improve patient flow. |
| 2 | wrong-block | 0.704 | Relationships | Health Professions | The Effectiveness of Outpatient Appointment Reminder Systems in Reducing No-Show Rates |
| 3 | distractor | 0.701 | Cost structure, Channels, Key activities | Computer Science | A Smart Laboratory Equipment Reservation Framework With AI-Based Scheduling And Performanc |
| 4 | distractor | 0.685 | Cost structure | Engineering | IoT and RFID-Enabled Smart Lab Monitoring System for Efficient Asset Management |
| 5 | distractor | 0.685 | Cost structure | Engineering | Indoor Tracking of Construction Workers Using BLE: Mobile Beacons and Fixed Gateways vs. F |
| 6 | distractor | 0.677 | Key partners | Arts and Humanities | Phat Beats, Dope Rhymes: Hip Hop Down Under Comin' Upper |
| 7 | distractor | 0.672 | Cost structure | Engineering | The Smart Device specification for remote labs |
| 8 | distractor | 0.667 | Customer segments, Key partners | Social Sciences | Phone Usage Of University Students Whilst Walking On Campus |
| 9 | relevant | 0.665 | Relationships, Key activities | Health Professions | A stochastic overbooking model for outpatient clinical scheduling with no-shows |
| 10 | unmarked | 0.659 | Cost structure | Engineering | Real Time Asset Tracking using BLE Beacons |

## spin

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | distractor | 0.705 | Cost structure | Engineering | Dynamic Production Tracking and Color-Coded Dashboard for Manufacturing Equipment |
| 2 | relevant | 0.697 | Key activities, Value proposition | Engineering | Machine Learning for Predictive Maintenance: A Multiple Classifier Approach |
| 3 | distractor | 0.680 | Cost structure, Relationships | Engineering | IoT and RFID-Enabled Smart Lab Monitoring System for Efficient Asset Management |
| 4 | distractor | 0.679 | Key activities | Engineering | Enhancing Compliance and Process Monitoring in Engineering Labs with IoT-Driven RFID Solut |
| 5 | distractor | 0.678 | Cost structure | Computer Science | Tracking and management of relations and relation capabilities in telecommunication networ |
| 6 | distractor | 0.668 | Cost structure, Key activities, Value proposition | Computer Science | LAB COMPLAINT CLEARANCE |
| 7 | distractor | 0.668 | Relationships, Cost structure, Key activities, Value proposition | Health Professions | New tracking systems improve patient flow. |
| 8 | distractor | 0.667 | Cost structure, Key activities, Value proposition | Engineering | Selection of a computerized maintenance management system for mechanical and industrial la |
| 9 | wrong-block | 0.661 | Key activities, Cost structure, Value proposition | Engineering | Data-Driven Methods for Predictive Maintenance of Industrial Equipment: A Survey |
| 10 | distractor | 0.658 | Key activities | Engineering | A heuristic approach for predictive diagnosis of wheel wear based on low-cost track-side e |

## preflight

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | distractor | 0.719 | Key activities | Business, Management and Accounting | Review on Preparation of SOPs for Different Instruments or Equipment |
| 2 | distractor | 0.701 | Cost structure | Psychology | Employee Skill Tracking With Open Badges |
| 3 | distractor | 0.692 | Key partners, Customer segments | Social Sciences | STUDENTS' PREFERENCES FOR EXTRACURRICULAR ACTIVITIES ON CAMPUS: A CASE STUDY AT VINH UNIVE |
| 4 | distractor | 0.687 | Key partners | Social Sciences | Phone Usage Of University Students Whilst Walking On Campus |
| 5 | distractor | 0.672 | Key activities, Relationships | Computer Science | LAB COMPLAINT CLEARANCE |
| 6 | distractor | 0.665 | Value proposition, Cost structure, Relationships | Health Professions | New tracking systems improve patient flow. |
| 7 | distractor | 0.661 | Key partners | Social Sciences | Balancing campus security and student rights: the case of the University of Botswana |
| 8 | distractor | 0.660 | Key partners, Key activities, Value proposition | Decision Sciences | Insuring Project Risks: Contractor Expectations versus Insurance Company Policies |
| 9 | unmarked | 0.656 | Value proposition, Key partners, Key activities | Chemical Engineering | Student Involvement in Improving the Culture of Safety in Academic Laboratories |
| 10 | unmarked | 0.656 | Value proposition | Health Professions | Microlearning the Safe Way: Why Short, Sharp Training Beats Marathon Sessions |

Marked, not in the top ten: W2119472226 (value_proposition); W2166258422 (value_proposition).

## dawn

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | distractor | 0.677 | Cost structure | Computer Science | LAB COMPLAINT CLEARANCE |
| 2 | distractor | 0.672 | Cost structure | Social Sciences | Physics Lab Toolbox - Collisions Lab |
| 3 | distractor | 0.670 | Cost structure | Computer Science | Workshop: Transform your IS Class Projects |
| 4 | distractor | 0.668 | Cost structure | Engineering | VIRTUAL LAB |
| 5 | distractor | 0.668 | Cost structure | Computer Science | A Smart Laboratory Equipment Reservation Framework With AI-Based Scheduling And Performanc |
| 6 | distractor | 0.666 | Cost structure | Computer Science | Web-based paperless equipment management system. |
| 7 | distractor | 0.664 | Cost structure | Engineering | Virtual Lab |
| 8 | distractor | 0.662 | Cost structure | Engineering | Digital Lab |
| 9 | relevant | 0.658 | Value proposition | Psychology | Sleepmore in Seattle: Later school start times are associated with more sleep and better p |
| 10 | distractor | 0.658 | Cost structure | Engineering | Using Identity Provider and Automatic Resource Management to Improve a Remote Networking L |

Marked, not in the top ten: W2318249357 (value_proposition).

## slice

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | distractor | 0.685 | Value proposition | Agricultural and Biological Sciences | Avoidance of Food Waste from a Grocery Retail Store Owner’s Perspective |
| 2 | distractor | 0.684 | Value proposition | Agricultural and Biological Sciences | FOOD WASTAGE MANAGEMENT SYSTEM |
| 3 | distractor | 0.683 | Value proposition | Agricultural and Biological Sciences | ADVANCED FOOD WASTAGE MANAGEMENT SYSTEM |
| 4 | distractor | 0.681 | Value proposition | Agricultural and Biological Sciences | Implementation of Zero Food Waste in the Buffet Restaurant Service (Case Study: Sheraton G |
| 5 | distractor | 0.678 | Value proposition | Business, Management and Accounting | Reducing Food Waste and Boosting Profits through Inventory Management: The Case of Small S |
| 6 | distractor | 0.672 | Value proposition | Agricultural and Biological Sciences | How to become a Food Waste-Fighter?: An exploratory study into food waste-reducing busines |
| 7 | distractor | 0.667 | Value proposition | Agricultural and Biological Sciences | SMART LOGISTICS SOLUTIONS FOR REDUCING FOOD WASTE: A CASE OF D NIPAH CATERING |
| 8 | distractor | 0.666 | Value proposition | Agricultural and Biological Sciences | Dealing with donations: Supply chain management challenges for food banks |
| 9 | distractor | 0.665 | Value proposition | Agricultural and Biological Sciences | A Multifaceted Evaluation of Food Waste in a Polish Supermarket—Case Study |
| 10 | distractor | 0.665 | Value proposition | Agricultural and Biological Sciences | Reducing food waste through direct surplus food redistribution: The Norwegian case |

Marked, not in the top ten: W2130960228 (key_activities); W3122167207 (key_activities).

## hush

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | distractor | 0.724 | Key activities, Value proposition | Health Professions | New tracking systems improve patient flow. |
| 2 | distractor | 0.691 | Value proposition, Customer segments, Key activities | Social Sciences | Phone Usage Of University Students Whilst Walking On Campus |
| 3 | distractor | 0.690 | Cost structure | Decision Sciences | Insuring Project Risks: Contractor Expectations versus Insurance Company Policies |
| 4 | distractor | 0.690 | Cost structure, Key activities | Engineering | IoT and RFID-Enabled Smart Lab Monitoring System for Efficient Asset Management |
| 5 | distractor | 0.688 | Key activities | Engineering | Dynamic Production Tracking and Color-Coded Dashboard for Manufacturing Equipment |
| 6 | distractor | 0.683 | Cost structure | Engineering | Advancements in Parcel Security: A Smart Monitoring Approach |
| 7 | distractor | 0.682 | Channels | Arts and Humanities | Phat Beats, Dope Rhymes: Hip Hop Down Under Comin' Upper |
| 8 | distractor | 0.676 | Cost structure | Engineering | Intelligent Packing Solution for Safe and Secured Delivery |
| 9 | distractor | 0.673 | Key activities, Cost structure | Engineering | Indoor Tracking of Construction Workers Using BLE: Mobile Beacons and Fixed Gateways vs. F |
| 10 | distractor | 0.672 | Key activities | Health Professions | Cognitive workload among orthopaedic nurses during the morning rush hours: results from fi |

Marked, not in the top ten: W2160540074 (value_proposition); W1999401028 (value_proposition).

## tumbler

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | relevant | 0.761 | Value proposition | Environmental Science | Promoting the Use of Reusable Coffee Cups through Environmental Messaging, the Provision o |
| 2 | relevant | 0.708 | Value proposition, Key activities | Environmental Science | Facility arrangements and the environmental performance of disposable and reusable cups |
| 3 | distractor | 0.675 | Key partners | Health Professions | Student Food Insecurity Campus Readiness Assessment: An Analysis of Campus Responses to St |
| 4 | distractor | 0.674 | Key activities, Value proposition | Agricultural and Biological Sciences | The Uovo Di Colombo Lab: Designing Against Food Waste |
| 5 | distractor | 0.669 | Customer segments, Key partners | Nursing | The rewards US university students associate with campus dining halls and food choices |
| 6 | distractor | 0.666 | Value proposition | Business, Management and Accounting | Food-sharing in the distributed use economy |
| 7 | distractor | 0.663 | Customer segments | Nursing | On‐campus food purchasing behaviours and satisfaction of Australian university students |
| 8 | distractor | 0.661 | Key partners | Social Sciences | Students’ Assessment of Campus Sustainability at the University of Dammam, Saudi Arabia |
| 9 | distractor | 0.660 | Key partners | Agricultural and Biological Sciences | “If only I Could Decide”: Opinions of Food Category Managers on in-Store Food Waste |
| 10 | distractor | 0.658 | Value proposition, Key activities | Agricultural and Biological Sciences | ‘It’s not really about the food, it’s also about food’: urban collective action, the commu |

## chill

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | distractor | 0.732 | Customer segments | Health Professions | Partnering to Build a Pantry: A University Campus Responds to Student Food Insecurity |
| 2 | distractor | 0.721 | Value proposition | Agricultural and Biological Sciences | Revolutionizing cold chain logistics: Leveraging IoT and AI for enhanced food safety and w |
| 3 | distractor | 0.719 | Value proposition, Cost structure | Engineering | IoT and RFID-Enabled Smart Lab Monitoring System for Efficient Asset Management |
| 4 | distractor | 0.708 | Customer segments | Health Professions | Student Food Insecurity Campus Readiness Assessment: An Analysis of Campus Responses to St |
| 5 | distractor | 0.703 | Value proposition, Cost structure, Relationships | Health Professions | New tracking systems improve patient flow. |
| 6 | wrong-block | 0.701 | Value proposition | Agricultural and Biological Sciences | A Wireless Sensor Network for Cold-Chain Monitoring |
| 7 | distractor | 0.698 | Customer segments | Health Professions | University Students Suggest Solutions to Campus Food Insecurity: A Mixed Methods Study |
| 8 | distractor | 0.698 | Customer segments | Health Professions | Student perceptions of on‐campus foodscapes at a Canadian university |
| 9 | distractor | 0.692 | Value proposition, Relationships | Agricultural and Biological Sciences | ADVANCED FOOD WASTAGE MANAGEMENT SYSTEM |
| 10 | distractor | 0.692 | Value proposition, Relationships | Agricultural and Biological Sciences | FOOD WASTAGE MANAGEMENT SYSTEM |

Marked, not in the top ten: W2876758168 (key_activities).

## movein

| # | status | score | blocks | field | title |
|---|---|---|---|---|---|
| 1 | distractor | 0.687 | Value proposition | Health Professions | New tracking systems improve patient flow. |
| 2 | distractor | 0.667 | Cost structure, Customer segments, Revenue streams | Social Sciences | Phone Usage Of University Students Whilst Walking On Campus |
| 3 | distractor | 0.649 | Cost structure, Customer segments | Decision Sciences | Insuring Project Risks: Contractor Expectations versus Insurance Company Policies |
| 4 | wrong-block | 0.648 | Value proposition | Engineering | Self-Organized Pedestrian Crowd Dynamics: Experiments, Simulations, and Design Solutions |
| 5 | distractor | 0.633 | Cost structure | Engineering | Customer Avionics Interface Development and Analysis (CAIDA) Lab DEWESoft Display Creation |
| 6 | distractor | 0.632 | Cost structure | Social Sciences | Legal Drafting: Some Elements of Technique |
| 7 | distractor | 0.631 | Customer segments, Channels | Social Sciences | Exploring Student Satisfaction with in-Campus Accommodation in Public Universities |
| 8 | distractor | 0.629 | Value proposition, Cost structure | Computer Science | A Smart Laboratory Equipment Reservation Framework With AI-Based Scheduling And Performanc |
| 9 | distractor | 0.628 | Customer segments | Social Sciences | First-in-Family Students, University Experience and Family Life |
| 10 | distractor | 0.626 | Key activities, Cost structure | Engineering | Dynamic Production Tracking and Color-Coded Dashboard for Manufacturing Equipment |

Marked, not in the top ten: W2089584121 (value_proposition).
