# Judged sample 2026-10-17 — `search` row

The third gate of `lodestone-card-search` design §9 and tasks 4.3: of ten
sampled cards, are at least half of the searched-in papers in the top five
relevant to the card? Read against `2026-10-17-search.md` (search on, quota
off, purposes off, `data/pglite-eval-search`), the top five as `priorArtFor`
ranks them with `perField: Infinity`.

Sample: every third card in `EVAL_CARDS` order (indices 0, 3, …, 27), so
seven firms cards and three cross-field cards: pulse, kiln, ward, pantry,
scribe, split, cart, nook, dawn, tumbler.

Caveat: these are Claude's judgements, not the owner's, by the owner's
choice. The standard applied: a paper is relevant when its subject overlaps
the card's mechanism, its specific problem, or its named counterparty closely
enough that the founder would learn something for a block. A paper that
merely shares the card's setting (students, campus, a library) or one
content word is not relevant. Each hit's abstract was read whole; the
quoted line is its first sentence. Hits that are not searched-in (a mark or
a distractor from the fixed corpus) are listed but not counted.

## Tally

| card | searched-in in top 5 | judged relevant |
|---|---|---|
| pulse | 5 | 0 |
| kiln | 5 | 1 |
| ward | 4 | 1 |
| pantry | 5 | 2 |
| scribe | 5 | 1 |
| split | 5 | 1 |
| cart | 5 | 1 |
| nook | 5 | 3 |
| dawn | 5 | 3 |
| tumbler | 4 | 0 |
| **total** | **48** | **13 (27%)** |

The gate asks for at least half. Counting every borderline case below as
relevant as well (ten of them, marked "borderline") gives 23 of 48, 48%,
still under half. The judged step fails on either reading.

The pattern: OpenAlex's semantic search returns practitioner newsletters,
magazine columns, syllabi, law notes and photo captions that are typed
`article` in a journal or conference source, so the `scholarly` filter lets
them through, and the embedder scores them close to the card because they
share its everyday vocabulary (registrar, library, landlord, meal, cup).
The two cards where search worked (nook, dawn) are the ones whose problem has
a literature with the same everyday words as the card (hotel overbooking,
class scheduling).

## pulse — intramural fitness leaderboards from gym swipe data

1. not relevant. *Study concerning the role of physical exercise in the segment of leisure of the students* (Gymnasium, 2008). "The study sought to highlight place it occupies in exercise activities practiced by students in their leisure time…" A descriptive survey of students' leisure exercise; shares the segment only, nothing on competition, leaderboards or attendance data. Borderline at most.
2. not relevant. *Intramural Sports Handbook* (2014). "Offer over 50 activities annually. Provide you with flyers…" A department handbook of services, not a study; the setting matches, nothing else.
3. not relevant. *How to Encourage Student Conference Attendance* (Eye on Psi Chi, 2016). Publication boilerplate; about conference attendance by psychology students.
4. not relevant. *The economics of fee-based iPhone applications versus free applications* (Issues in Information Systems, 2010). "iPhone applications are a lucrative business for developers if an application gets noticed." Pulled in by the `cost_structure` block's "app hosting"; nothing on the idea.
5. not relevant (borderline). *LEAN: real-time analysis of resistance training using wearable computing* (Sensors, 2023). "The use of fitness apps to track physical exercise has been proven to promote weight loss and increase physical activity." Wearable exercise tracking; the card tracks attendance from swipes and runs competitions, which the paper does not touch.

## kiln — student ceramics, prints and jewellery sold with pickup at the studio

1. not relevant. *Contract—Principal and agent—Agent to receive commission if he effects sale…* (Cambridge Law Journal, 1942). A case note on agents' commission; matched "commission on each sale" by word.
2. not relevant. *Truck or treat: delivering Halloween at frightening speed* (Inbound Logistics, 1999). "Subtitle: the trick?" Seasonal retail logistics.
3. not relevant. *Flagship market sold?: on the market floor* (Farmers' Weekly, 2016). A produce-market trade column.
4. relevant. *Picture perfect* (The Reference Librarian, 2018). "The purchasing of student art for display in a library can enhance a building while supporting creative achievement and collaboration with art faculty." A campus institution buying student-made art in collaboration with the art department: the card's segment, partner and proposition in one case.
5. not relevant. *The Writing Center and Transfer of Learning: A Primer for Directors* (Writing Center Journal, 2015). Abstract is letter-spaced noise; the subject is writing-centre pedagogy.

## ward — package alerts for apartment lobbies

1. (distractor, not counted) *Wi-Alert: WiFi sensing for real-time package theft alerts at residential doorsteps* (MobiHoc, 2023). On the idea exactly; from the fixed corpus, not searched in.
2. not relevant (borderline). *A novel and optimal approach for multimedia cloud storage and delivery to reduce total cost of ownership* (EAI Transactions on Cloud Systems, 2020). Storage cost for audio-visual content; touches "clip storage" in `cost_structure` and nothing else.
3. relevant. *FEDSecurity: implementation of computer vision thru face and eye detection* (IJMLC, 2018). "Closed-circuit television cameras are placed everywhere in both public and private areas and used in a broad range of applications, especially for security purposes…" Camera-based detection for security monitoring: the `key_resources` block's "lobby cameras and a delivery-detection model", though for faces rather than parcels.
4. not relevant. *Your common questions answered* (Nursing Standard, 1993). "What is the difference between hardware and software?"
5. not relevant. *Real property: landlord and tenant, mechanics' and materialmen's liens, and foreclosure* (Southwestern Law Journal, 1982). A survey of Texas property law; "landlord" matched.

## pantry — ten-minute microwave meal kits for dorms

1. not relevant (borderline). *How to make your weekly meal prep easy* (The Nation's Health, 2018). "If you've ever seen pictures online of people showing off their weekly meal preparation skills…" Consumer advice on batch cooking; the card replaces cooking.
2. relevant. *Alimentación saludable: mejorando sus comidas precocidas* (EDIS, 2012). "Las comidas precocidas son alimentos que requieren poca preparación." Extension guidance on making pre-cooked convenience meals healthier: the proposition's nutrition claim for ten-minute meals.
3. not relevant (borderline). *Mal schnell was essen — Ernährung im Rettungsdienst* (retten!, 2014). "Packung auf, ab in die Mikrowelle — und fertig ist das Mittagessen." Microwave meals for ambulance crews; the mechanism (microwave-only eating) matches, the segment and the product do not.
4. relevant. *The fourth channel: automatic home replenishment and its implications for supply chain cost and customer convenience* (Management and Business Review, 2023). "…recent developments in grocery shopping and delivery models and explore subscription and automatic replenishment services." Subscription food delivery economics: `revenue_streams` and `relationships` (a weekly subscription).
5. not relevant. *Development of models for effective order distribution among suppliers* (Vestnik VGTU, 2010). Supplier order allocation; "order" and "delivery" matched.

## scribe — paid note-taker per course, notes posted the same evening

1. not relevant. *Regulations: Correspondence Courses in Higher Education (1987)* (Chinese Education & Society, 1992). "Article 34." Regulatory text on correspondence courses.
2. not relevant (borderline). *Train RAs to provide students with a better experience* (Disability Compliance for Higher Education, 2017). "Some disability services offices offer training to faculty members about academic accommodations…" The card's channel (the disability services office) appears, but the piece is about training resident advisers.
3. not relevant. *PSYX 594.01: Seminar: Political Psychology* (2014). A course syllabus whose accommodations paragraph matched.
4. not relevant. *Recording committee meetings: keeping it simple* (Nursing Management, 1995). Minute-taking for committees.
5. relevant. *E-notes* (ACM SIGCSE Bulletin, 2003). "Writing comprehensive, focused notes during a lecture can be a challenging task for students." A system for lecture note-taking and sharing: the proposition itself.

## split — roommate bills split and paid before the due date

1. not relevant (borderline). *Logement et modes de cohabitation des étudiants parisiens* (Espace populations sociétés, 1990). "Housing and types of accommodation of students in Paris." A demographic study of the segment; nothing on shared bills.
2. not relevant. *Renting Right* (Journal of Legislation, 2020). "Tuesday, February 11, 2020, at 7:00 p.m." An event notice.
3. not relevant. *Law report: leases, 'what you need to know'* (Journal of the Australian Traditional-Medicine Society, 2015). A plain-language note on leases for practitioners.
4. relevant. *How can we get customers to pay?* (Opflow, 2004). "This month's question is on collecting overdue water bills and fees." The utility's side of late payment, which the card's open `revenue_streams` question ("whether the utility will pay for on-time collections") turns on.
5. not relevant. *Construction ahead: what regulators should ask about the information superhighway* (Fortnightly, 1994). Telecoms regulation; "internet providers" matched.

## cart — dining-hall meals delivered to the dorm on a meal swipe

1. not relevant. *Jack's blog* (Engineering & Technology, 2013). "They've introduced biometric sensing on campus." A magazine column.
2. not relevant. *Regulations: Correspondence Courses in Higher Education (1987)* (1992). As for scribe; a document the embedder places near several campus cards.
3. not relevant. *The Writing Center and Transfer of Learning* (2015). As for kiln.
4. not relevant. *Thinking outside the box* (Fairplay, 2009). "Box carriers need to change their business model to cut costs…" Container shipping.
5. relevant. *Smart-ID card* (IJRASET, 2020). "The college lives of students cover a wide range of transactions which he/she has to make…" A campus ID card as the payment instrument for student transactions: the proposition's "paid with the swipe they already have".

## nook — study rooms released to the waitlist when the booker does not show

1. relevant. *The overbooking question: a simulation* (Cornell Hotel and Restaurant Administration Quarterly, 1989). "A simulation model for your hotel's reservations system can help you find the optimum reservations policy — one that maximizes profit and minimizes the extremes of walking guests or leaving no-shows' rooms unfilled." The `key_activities` block's "decide how far to overbook", in another industry.
2. not relevant (borderline). *Mobile apps for librarians* (Journal of Access Services, 2013). Library mobile services in general; the card's channel, not its mechanism.
3. relevant. *Dynamic operating rules for motel reservations* (Decision Sciences, 1976). "…decisions have to be made concerning the allocation of the available rooms." Room allocation under uncertain arrivals.
4. not relevant (borderline). *Building the library's next site* (Public & Access Services Quarterly, 2009). Library website redesign.
5. relevant. *Revenue maximization for the hotel industry through nested booking limit procedures* (Tourism Analysis, 1998). Booking limits under uncertain demand: the overbooking decision again.

## dawn — timetables that keep first-year sections out of the earliest slots

1. relevant. *Address scheduling challenges with creative solutions* (The Successful Registrar, 2019). "…the majority of classes run on a block schedule, all starting at the beginning of the term…" A registrar's view of section scheduling: the card's customer and activity, in a practitioner newsletter rather than a study.
2. not relevant (borderline). *Make registration a smooth process by providing students with effective tools* (The Successful Registrar, 2017). Registration tooling, not timetabling.
3. relevant. *F22RS SGR No. 2 (Prime Time Class Scheduling)* (2022). "To urge and request that the University Registrar halts the reimplementation of a policy that limits departments to scheduling no more than 55% of their course sections within prime-time hours." A student-government resolution on exactly the lever the card pulls, which sections sit in which hours. Not a paper, but on the card.
4. relevant. *Final exam scheduling at Bucknell University: a case study and open-source tool* (INFORMS Journal on Applied Analytics, 2026). A university timetabling solver with an open-source tool: the `key_activities` and `cost_structure` blocks (re-solve the timetable; solver development).
5. not relevant. *How would you help your registrar manage her time?* (The Successful Registrar, 2015). Time management for registrars.

## tumbler — a deposit cup accepted at every campus café

1. (mark, not counted) *Promoting the use of reusable coffee cups through environmental messaging, the provision of alternatives and financial incentives* (Sustainability, 2018). The card's own mark, from the fixed corpus.
2. not relevant. *Variety of baked goods displayed at the Student Union cafeteria…* (2023). A photo caption typed as an article.
3. not relevant. *Repair cafés in the Netherlands: capitalist abstinence as a challenge to a linear capitalist economy* (Vibrant, 2023). "Repair cafés have become a common phenomenon in the Netherlands…" Circular economy, but the café is a repair meet-up; "café" matched.
4. not relevant. *Leading through change* (AMA Journal of Ethics, 2011). "Can I get a grande latte, double shot of espresso with skim milk and Splenda?" An essay on medical leadership opening with a coffee order.
5. not relevant. *Lessons from Cape Town's kerbside: getting everyone sorted* (The First Resource, 2007). Municipal recycling collection; "collection runs" matched, the mechanism (a deposit-return loop) does not.
