/** A synthetic course cohort: eight members, each with one Forge idea as a
 *  `forge-idea/2` document, and five paper abstracts for the corpus. Written
 *  so the seed script and the tests read the same fixture. Every name and
 *  idea here is invented. */

type Origin = "confirmed" | "draft" | "open";
interface Entry {
  block: string;
  text: string;
  origin?: Origin;
  evidence?: string;
}

export interface CohortMember {
  name: string;
  email: string;
  ideaId: string;
  title: string;
  line: string;
  /** What the author said in the thread; drafts quote from it. */
  said: string[];
  entries: Entry[];
  profile?: Record<string, string>;
}

const hex = (n: number) => n.toString(16).padStart(32, "0");

export function forgeDocument(m: CohortMember): Record<string, unknown> {
  return {
    format: "forge-idea/2",
    id: m.ideaId,
    title: m.title,
    line: m.line,
    seed: null,
    profile: m.profile ?? {},
    workspaces: [
      {
        framework: "business_model",
        grade: null,
        segments: [],
        canvas: m.entries.map((e, i) => ({
          key: `k-${m.ideaId.slice(-4)}-${i}`,
          block: e.block,
          text: e.text,
          origin: e.origin ?? "confirmed",
          evidence: e.evidence ?? null,
          segment: null,
          run_id: null,
        })),
        thread: [
          { role: "forge", text: "What is the one thing you already have that a newcomer does not?", at: "2026-09-01T10:00:00Z" },
          ...m.said.map((text, i) => ({ role: "you" as const, text, at: `2026-09-01T10:0${i + 1}:00Z` })),
        ],
      },
    ],
  };
}

export const COHORT: CohortMember[] = [
  {
    name: "Sam Rivera",
    email: "sam.rivera@cohort.test",
    ideaId: hex(0xa1),
    title: "Sublet, sight seen",
    line: "Verified student-to-student sublets with a walkthrough video before the lease is signed.",
    said: [
      "Incoming international grad students sign a year lease months before they can see the apartment.",
      "The departing student records a walkthrough and the deposit sits in escrow until move-in.",
    ],
    entries: [
      { block: "customer_segments", text: "Incoming international graduate students who must sign a lease before arriving" },
      { block: "value_proposition", text: "A verified sublet from a departing student with a walkthrough video and a semester-length lease" },
      { block: "channels", text: "The international students office pre-arrival email and the graduate housing listserv", origin: "draft", evidence: "months before they can see the apartment" },
      { block: "relationships", text: "One handoff per semester; the departing student vouches for the arriving one" },
      { block: "revenue_streams", text: "Whether a share of one month's rent survives the university's housing rules", origin: "open" },
      { block: "key_resources", text: "The departing-student supply each May and December" },
      { block: "key_activities", text: "Verify both students against enrolment, record the walkthrough, escrow the deposit", origin: "draft", evidence: "the deposit sits in escrow until move-in" },
      { block: "key_partners", text: "Whether the graduate housing office lists or competes", origin: "open" },
      { block: "cost_structure", text: "Deposit escrow and identity checks per match; near zero otherwise" },
    ],
    profile: { location_home: "Ithaca, New York", skill_ops: "Ran leasing for a 400-unit student building" },
  },
  {
    name: "Priya Natarajan",
    email: "priya.n@cohort.test",
    ideaId: hex(0xa2),
    title: "Visiting scholar rooms",
    line: "Furnished rooms for visiting faculty, matched to sabbatical calendars.",
    said: ["Visiting faculty arrive for a semester and end up in hotels because furnished leases do not fit the term."],
    entries: [
      { block: "customer_segments", text: "Visiting faculty and postdocs on one-semester appointments" },
      { block: "value_proposition", text: "A furnished room near campus with a lease that matches the appointment dates" },
      { block: "channels", text: "Department administrators who process visiting appointments" },
      { block: "relationships", text: "A host household vetted once and reused every term" },
      { block: "revenue_streams", text: "A placement fee charged to the hosting department", origin: "draft", evidence: "end up in hotels" },
      { block: "key_resources", text: "A vetted host roster of faculty households with spare rooms" },
      { block: "key_activities", text: "Vet hosts, align lease dates to appointment letters, handle deposits" },
      { block: "key_partners", text: "The graduate housing office and department administrators" },
      { block: "cost_structure", text: "Host vetting and a small deposit float" },
    ],
  },
  {
    name: "Daniel Okafor",
    email: "daniel.o@cohort.test",
    ideaId: hex(0xa3),
    title: "Move-out market",
    line: "Graduating students sell furniture and leases to arriving ones in one May window.",
    said: ["Every May the curb is full of furniture and every August students buy the same furniture new."],
    entries: [
      { block: "customer_segments", text: "Graduating seniors leaving campus housing and incoming students arriving in August" },
      { block: "value_proposition", text: "Sell a whole room's furniture and lease takeover in one listing with pickup timed to move-out" },
      { block: "channels", text: "Residence hall move-out notices and class-year group chats" },
      { block: "relationships", text: "One transaction per student per year" },
      { block: "revenue_streams", text: "A fee per completed handoff", origin: "draft", evidence: "students buy the same furniture new" },
      { block: "key_resources", text: "The May and December departure supply from campus housing" },
      { block: "key_activities", text: "List, match to arriving students, schedule pickup within the move-out window" },
      { block: "key_partners", text: "Campus housing and the student moving companies" },
      { block: "cost_structure", text: "Storage between May and August is the main cost" },
    ],
  },
  {
    name: "Wen Li",
    email: "wen.li@cohort.test",
    ideaId: hex(0xa4),
    title: "Arrival concierge",
    line: "A pre-arrival service that sets up housing, banking and a phone for international students.",
    said: ["International students arrive with no bank account, no phone number and no idea where they will sleep."],
    entries: [
      { block: "customer_segments", text: "International students arriving for their first term" },
      { block: "value_proposition", text: "Housing, a bank account and a phone plan arranged before the flight lands" },
      { block: "channels", text: "The international students office pre-arrival email", origin: "draft", evidence: "no idea where they will sleep" },
      { block: "relationships", text: "A named concierge for the first thirty days" },
      { block: "revenue_streams", text: "A flat pre-arrival package fee paid by the student or a sponsor" },
      { block: "key_resources", text: "Partnerships with a bank and a carrier that accept a pre-arrival application" },
      { block: "key_activities", text: "Collect documents, open accounts, secure a room, meet the student at arrival" },
      { block: "key_partners", text: "A local bank, a mobile carrier, and the international students office" },
      { block: "cost_structure", text: "Concierge labour per student" },
    ],
  },
  {
    name: "Maren Olsted",
    email: "maren.o@cohort.test",
    ideaId: hex(0xa5),
    title: "Barn heat",
    line: "A heat-recovery unit sized for a sixty-cow dairy, installed by the farm's own plumber.",
    said: ["A small dairy chills milk twice a day and dumps the heat outdoors, then burns propane to heat wash water."],
    entries: [
      { block: "customer_segments", text: "Dairies under three hundred cows in the Northeast" },
      { block: "value_proposition", text: "Recover the heat the milk chiller throws away to heat wash water and cut propane" },
      { block: "channels", text: "Extension agents and the dairy equipment dealers farms already use" },
      { block: "relationships", text: "Sold once, serviced by the plumber the farm already trusts" },
      { block: "revenue_streams", text: "Unit sale with a propane-savings payback under three years", origin: "draft", evidence: "burns propane to heat wash water" },
      { block: "key_resources", text: "A unit design priced for a sixty-cow barn" },
      { block: "key_activities", text: "Size the unit per barn, train plumbers, track propane savings" },
      { block: "key_partners", text: "Regional plumbing contractors and the extension service" },
      { block: "cost_structure", text: "Manufacturing the exchanger and the installer training" },
    ],
  },
  {
    name: "Tomas Ferreira",
    email: "tomas.f@cohort.test",
    ideaId: hex(0xa6),
    title: "Rural clinic scheduling",
    line: "Shared scheduling for rural clinics that lose half their appointments to no-shows.",
    said: ["Rural clinics book by phone and lose a third of appointments to no-shows because patients cannot get a ride."],
    entries: [
      { block: "customer_segments", text: "Rural primary care clinics with under five providers" },
      { block: "value_proposition", text: "Scheduling that books the ride with the appointment so patients actually arrive" },
      { block: "channels", text: "Rural health networks and county health departments" },
      { block: "relationships", text: "A monthly subscription with a clinic champion" },
      { block: "revenue_streams", text: "A per-clinic monthly subscription" },
      { block: "key_resources", text: "Ride partners in each county and the scheduling software" },
      { block: "key_activities", text: "Integrate with the clinic calendar, dispatch rides, confirm by text" },
      { block: "key_partners", text: "County transit and volunteer driver programs" },
      { block: "cost_structure", text: "Software hosting and ride coordination staff", origin: "draft", evidence: "cannot get a ride" },
    ],
  },
  {
    name: "Aisha Bello",
    email: "aisha.b@cohort.test",
    ideaId: hex(0xa7),
    title: "Dining surplus",
    line: "Campus dining surplus routed to student food pantries the same evening.",
    said: ["Dining halls throw away trays of food at closing while the campus food pantry runs out by Wednesday."],
    entries: [
      { block: "customer_segments", text: "Campus dining operations and student food pantries" },
      { block: "value_proposition", text: "Surplus meals packed at closing and delivered to the pantry the same evening" },
      { block: "channels", text: "The dining director and the student pantry coordinators" },
      { block: "relationships", text: "A standing nightly pickup schedule" },
      { block: "revenue_streams", text: "Dining pays a per-pickup fee against its waste-hauling budget", origin: "draft", evidence: "throw away trays of food at closing" },
      { block: "key_resources", text: "Food-safe containers and a student courier pool" },
      { block: "key_activities", text: "Pack surplus, log temperatures, deliver within the safe window" },
      { block: "key_partners", text: "Campus dining and the food pantry" },
      { block: "cost_structure", text: "Courier stipends and containers" },
    ],
  },
  {
    name: "Jonas Weber",
    email: "jonas.w@cohort.test",
    ideaId: hex(0xa8),
    title: "Lab freezer watch",
    line: "A cheap sensor and phone alert for the lab freezers that fail on weekends.",
    said: ["A minus-eighty freezer fails on a Saturday and a year of samples is gone before anyone walks in on Monday."],
    entries: [
      { block: "customer_segments", text: "Academic research labs with ultra-low freezers and no facilities monitoring" },
      { block: "value_proposition", text: "A sensor that texts the lab when a freezer warms, before the samples are lost" },
      { block: "channels", text: "Lab managers and departmental safety officers" },
      { block: "relationships", text: "A subscription per freezer with a lab-manager contact" },
      { block: "revenue_streams", text: "Monthly monitoring per freezer" },
      { block: "key_resources", text: "A low-cost temperature sensor with cellular backup" },
      { block: "key_activities", text: "Install, monitor, escalate alerts to the on-call student", origin: "draft", evidence: "before anyone walks in on Monday" },
      { block: "key_partners", text: "The university's environmental health and safety office" },
      { block: "cost_structure", text: "Sensor hardware and the alerting service" },
    ],
  },
];

export interface CorpusPaper {
  title: string;
  abstract: string;
  year: number;
  venue: string;
  field: string;
}

/** Five invented abstracts, two of which bear on the housing ideas. */
export const CORPUS: CorpusPaper[] = [
  {
    title: "Sight-unseen leasing and the arriving-student housing gap",
    abstract:
      "International graduate students frequently sign year-long leases for apartments they have never seen, months before arrival. We survey four hundred arriving students and find that sight-unseen leasing raises first-term housing dissatisfaction and mid-lease moves. A walkthrough video shared by the departing tenant and a deposit held in escrow until move-in reduce both.",
    year: 2025,
    venue: "Journal of Student Affairs Research",
    field: "Social Sciences",
  },
  {
    title: "Seasonal supply in campus housing markets",
    abstract:
      "Campus housing markets clear twice a year, in May and August, when graduating students leave and arriving students search. We model the departure supply of furniture and lease takeovers and show that matching within the move-out window recovers most of the value otherwise discarded at the curb.",
    year: 2024,
    venue: "Regional Science and Urban Economics",
    field: "Economics",
  },
  {
    title: "Heat recovery from milk cooling on small dairy farms",
    abstract:
      "Dairies chill milk from body temperature to storage temperature twice daily and reject the heat outdoors, then heat wash water with propane. We size a heat-recovery exchanger for barns under one hundred cows and report propane savings and payback periods from twelve farm installations.",
    year: 2023,
    venue: "Applied Energy",
    field: "Engineering",
  },
  {
    title: "Missed appointments in rural primary care: transportation as the binding constraint",
    abstract:
      "Rural clinics report no-show rates near a third of booked appointments. Across nine clinics we find that lack of transportation explains most missed visits, and that scheduling systems which book a ride with the appointment cut no-shows substantially.",
    year: 2024,
    venue: "Journal of Rural Health",
    field: "Medicine",
  },
  {
    title: "Continuous temperature monitoring for ultra-low laboratory freezers",
    abstract:
      "Ultra-low freezers in academic laboratories fail without warning, and losses concentrate on weekends when no one is present. We evaluate low-cost cellular temperature sensors with phone alerts across forty freezers and report detection latency and prevented sample losses.",
    year: 2025,
    venue: "Laboratory Practice",
    field: "Biochemistry",
  },
];
