/** A larger synthetic cohort for demos: twenty-four fictional "fang-" firms,
 *  each a campus-scale take on a business model people already know, filed
 *  as `forge-idea/2` documents, and a corpus of invented abstracts that
 *  bear on them. Everything here is made up; the resemblance to any real
 *  company stops at the shape of the model. Loaded with
 *  `npm run lodestone:seed -- --set firms`. */
import type { CohortMember, CorpusPaper } from "./cohort";

type Origin = "confirmed" | "draft" | "open";
/** A block's text, or the text with its origin and the thread quote it
 *  rests on (drafts) — the same shape `cohort.ts` writes out longhand. */
type Block = string | [text: string, origin: Origin, evidence?: string];

const ORDER = [
  "customer_segments",
  "value_proposition",
  "channels",
  "relationships",
  "revenue_streams",
  "key_resources",
  "key_activities",
  "key_partners",
  "cost_structure",
] as const;

const hex = (n: number) => n.toString(16).padStart(32, "0");

interface Firm {
  slug: string;
  founder: string;
  line: string;
  said: string[];
  blocks: [Block, Block, Block, Block, Block, Block, Block, Block, Block];
  profile?: Record<string, string>;
}

function member(index: number, f: Firm): CohortMember {
  const first = f.founder.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "");
  return {
    name: f.founder,
    email: `${first}@fang-${f.slug}.test`,
    ideaId: hex(0xb00 + index),
    title: `fang-${f.slug}`,
    line: f.line,
    said: f.said,
    profile: f.profile,
    entries: f.blocks.map((b, i) =>
      typeof b === "string"
        ? { block: ORDER[i], text: b }
        : { block: ORDER[i], text: b[0], origin: b[1], evidence: b[2] },
    ),
  };
}

const FIRM_LIST: Firm[] = [
  // Housing and space.
  {
    slug: "nest",
    founder: "Nora Castellanos",
    line: "Spare rooms near campus let to visiting parents on the weekends hotels sell out.",
    said: [
      "Every parents' weekend and graduation the two hotels in town are full by March and families drive in from an hour away.",
      "Faculty and staff households have a spare room and would host for a few hundred dollars a weekend.",
    ],
    blocks: [
      "Parents and relatives visiting for move-in, parents' weekend, and graduation",
      "A vetted spare room in a faculty or staff home, walking distance to campus, on the weekends hotels sell out",
      ["The parents' association mailing and the event pages for the big weekends", "draft", "families drive in from an hour away"],
      "Hosts vetted once, rebooked for the same weekends every year",
      "A commission on each weekend stay",
      "A roster of staff and faculty households with a spare room",
      "Vet hosts, set weekend calendars, handle keys and payment",
      ["Whether the university will list it alongside the hotel block", "open"],
      "Host vetting, insurance, and payment processing",
    ],
    profile: { location_home: "Ithaca, New York", skill_ops: "Managed a bed and breakfast for three summers" },
  },
  {
    slug: "atlas",
    founder: "Ravi Menon",
    line: "A rent map for student neighbourhoods built from what students actually paid.",
    said: [
      "Nobody knows whether a nine-hundred-dollar room on Linden is a deal or a rip-off because the only prices are the asking prices.",
      "Students will share their lease if they get the map in return.",
    ],
    blocks: [
      "Undergraduates and graduate students searching for off-campus housing",
      "A street-by-street map of what students really paid last year, not the asking price",
      ["The housing fair, the off-campus living office, and the subreddit", "draft", "the only prices are the asking prices"],
      "Give a lease, get the map; the data compounds each year",
      ["Landlords pay for verified listings; whether students pay for anything", "open"],
      "The crowd-sourced lease data and the parcel map",
      "Collect leases, verify against addresses, redraw the map each August",
      "The off-campus living office and the tenant union",
      "Data verification and hosting; near zero otherwise",
    ],
  },
  {
    slug: "stow",
    founder: "Elena Varga",
    line: "Summer storage in neighbours' garages instead of a unit across town.",
    said: [
      "Students pay two hundred a month for a storage unit across town when the retiree next door has an empty garage.",
      "The host sets the price and we do the pickup in May and the drop-off in August.",
    ],
    blocks: [
      "Students leaving campus for the summer with a room's worth of belongings",
      "Storage in a neighbour's garage a block from campus, picked up in May and returned in August",
      "Residence hall move-out notices and the international students listserv",
      "Hosts rebooked each summer; students rebooked each year until they graduate",
      ["A booking fee on top of the host's price", "draft", "The host sets the price"],
      "Vetted hosts with dry garage space near campus",
      "Vet hosts, run the May pickup and August return, insure what is stored",
      "The moving companies that already do May pickups",
      "Pickup labour, a van, and insurance",
    ],
  },
  // Mobility and logistics.
  {
    slug: "lift",
    founder: "Marcus Hale",
    line: "Late-night campus rides by vetted student drivers when the buses stop.",
    said: [
      "The buses stop at midnight and the library closes at two, so people walk home in the dark or wait forty minutes for a cab.",
      "Student drivers with a parking permit would run three or four rides a night for gas money and a stipend.",
    ],
    blocks: [
      "Students leaving the library, labs, and night shifts after the buses stop",
      "A ride from a vetted student driver within ten minutes, midnight to three",
      ["The safety office, the libraries, and the student government app", "draft", "The buses stop at midnight"],
      "Drivers on a weekly schedule; riders see the same faces",
      ["Whether the university pays per ride or students pay a flat two dollars", "open"],
      "A pool of vetted student drivers with permits and insurance",
      "Vet drivers, run the dispatch, log every ride",
      "The campus safety office and the student government",
      "Driver stipends, insurance, and dispatch",
    ],
  },
  {
    slug: "route",
    founder: "Yusuf Demir",
    line: "Freight booking for small importers who still get quotes by email.",
    said: [
      "A shop importing twenty pallets a quarter spends a week emailing forwarders for quotes and then books on a spreadsheet.",
      "The forwarders would rather get a complete booking than a dozen half-formed emails.",
    ],
    blocks: [
      "Small importers moving under fifty pallets a quarter",
      "A quote from three forwarders in an hour and one booking page instead of a week of email",
      "Trade associations and the customs brokers importers already use",
      "A named coordinator per shipment",
      ["A margin on each booked shipment", "draft", "books on a spreadsheet"],
      "Rate agreements with regional forwarders",
      "Collect shipment details, gather quotes, book, track to the door",
      "Regional freight forwarders and customs brokers",
      "Coordinator labour and the booking software",
    ],
  },
  {
    slug: "cart",
    founder: "Hana Sato",
    line: "Dorm delivery from the dining halls by students on the meal plan.",
    said: [
      "A student with the flu cannot get to the dining hall and the meal they already paid for goes unused.",
      "Other students on the plan would carry a tray across the quad for a small fee.",
    ],
    blocks: [
      "Students on the meal plan who are sick, studying, or snowed in",
      "A dining hall meal delivered to the dorm, paid with the swipe they already have",
      "The dining app and the residence hall advisors",
      "Couriers from the same halls; a standing dinner-hour pool",
      ["A delivery fee per meal, with dining covering it for students on medical leave", "draft", "the meal they already paid for goes unused"],
      "A courier pool and insulated bags",
      "Take orders, pack at the hall, deliver within twenty minutes",
      ["Whether campus dining will let a swipe be used by a courier", "open"],
      "Courier pay and bags",
    ],
  },
  // Money.
  {
    slug: "ledger",
    founder: "Olivia Brandt",
    line: "Payments and books for student clubs that still collect dues in cash.",
    said: [
      "A club with eighty members collects dues in cash, loses the envelope, and cannot tell the student activities office where the money went.",
      "Treasurers change every spring and the new one inherits a shoebox.",
    ],
    blocks: [
      "Student club treasurers responsible for dues, event tickets, and reimbursements",
      "Collect dues and ticket money by card, with the books the activities office wants written automatically",
      ["The student activities office onboarding for new club officers", "draft", "Treasurers change every spring"],
      "A treasurer handoff each spring that keeps the history",
      "A small fee per transaction",
      "A payments integration and a ledger the activities office accepts",
      "Onboard clubs, process payments, produce the year-end report",
      "The student activities office and the campus bank branch",
      "Payment processing fees and support",
    ],
  },
  {
    slug: "vault",
    founder: "Kwame Asante",
    line: "Shared passwords for small nonprofits whose logins live in a volunteer's inbox.",
    said: [
      "A food bank's donor database login is in the inbox of a volunteer who left in June.",
      "They need a shared vault that a board member can hand over when staff turn over.",
    ],
    blocks: [
      "Nonprofits with under ten staff and a rotating volunteer base",
      "One shared vault for the organisation's logins with handover built in when people leave",
      "The state nonprofit association and the community foundations that fund them",
      "An annual review with the executive director",
      ["A flat annual price per organisation", "draft", "a volunteer who left in June"],
      "A credential vault with organisation-level recovery",
      "Onboard the organisation, import logins, run the handover when staff change",
      "Community foundations and nonprofit associations",
      "Hosting, security audits, and support",
    ],
  },
  {
    slug: "split",
    founder: "Lucia Moreno",
    line: "Roommate bills split and paid automatically before the late fee.",
    said: [
      "Four roommates, one name on the electric bill, and the same argument every month about who owes what.",
      "If the bill is split the day it arrives and each share is paid on time, the argument never starts.",
    ],
    blocks: [
      "Students sharing an apartment with utilities in one roommate's name",
      "Every shared bill split the day it arrives and each share paid before the due date",
      ["The off-campus housing office and the lease-signing moment", "draft", "one name on the electric bill"],
      "A household that stays signed up for the length of the lease",
      ["A monthly household fee; whether the utility will pay for on-time collections", "open"],
      "Connections to the regional utilities and a payments rail",
      "Fetch bills, split them, collect shares, pay the utility",
      "The regional utilities and the internet providers",
      "Payment rails and utility integrations",
    ],
  },
  // Learning.
  {
    slug: "lingo",
    founder: "Ingrid Solberg",
    line: "Five-minute daily lessons that keep lab safety training from being an annual slideshow.",
    said: [
      "Everyone clicks through the annual safety training in an hour and remembers none of it in the lab.",
      "Five minutes a day with a streak would teach the same material and the safety office could see who actually knows it.",
    ],
    blocks: [
      "Graduate students and technicians in wet labs who must stay certified",
      "Safety training as five-minute daily lessons with a streak, instead of an annual hour-long slideshow",
      ["The environmental health and safety office that assigns the training", "draft", "clicks through the annual safety training"],
      "A streak per person and a dashboard per lab",
      "A per-seat annual licence paid by the safety office",
      "A lesson bank mapped to the safety office's required topics",
      "Write lessons, schedule them, report completion to the safety office",
      "The environmental health and safety office",
      "Content authoring and hosting",
    ],
  },
  {
    slug: "tutor",
    founder: "Devon Price",
    line: "Peer tutoring matched by course and section, paid by the hour.",
    said: [
      "Students who aced organic chemistry last year would tutor for twenty dollars an hour but no one knows who they are.",
      "The learning centre has a waitlist three weeks long in October.",
    ],
    blocks: [
      "Undergraduates struggling in gateway courses with a waitlisted learning centre",
      "A tutor who took the same course with the same professor, booked for tonight",
      ["The learning centre waitlist and the course discussion boards", "draft", "a waitlist three weeks long"],
      "Repeat bookings with the same tutor through the semester",
      "A commission on each tutoring hour",
      "Tutors verified against transcripts",
      "Verify tutors, match by course and section, handle booking and payment",
      "The learning centre and the departments with gateway courses",
      "Tutor verification and payment processing",
    ],
  },
  {
    slug: "scribe",
    founder: "Mei Chen",
    line: "Lecture notes transcribed and shared per course for students who miss class.",
    said: [
      "A student out sick for a week has to beg for notes and gets three different sets, none complete.",
      "One good note-taker per course, paid a stipend, and everyone registered gets the notes the same evening.",
    ],
    blocks: [
      "Students who miss lectures for illness, athletics, or accommodations",
      "A complete set of notes for every lecture, posted the same evening by a paid note-taker in the course",
      "The disability services office and the athletics academic advisors",
      "A note-taker per course per term",
      ["A per-course subscription, paid by the student or by accommodations", "draft", "gets three different sets, none complete"],
      "A roster of vetted note-takers",
      "Recruit note-takers, review the notes, post them each evening",
      "The disability services office and the registrar",
      "Note-taker stipends",
    ],
  },
  // Food.
  {
    slug: "sprout",
    founder: "Teodora Ilić",
    line: "Farmers' market groceries delivered the same morning to people who cannot get there.",
    said: [
      "The Saturday market has the best produce in the county and the people who need it most work Saturday mornings.",
      "The vendors would pack an order Friday night if someone carried it the last mile.",
    ],
    blocks: [
      "Households who want market produce but work or cannot travel on market mornings",
      "A box from the vendors at the Saturday market, ordered by Thursday and delivered by noon Saturday",
      "The market's own newsletter and the vendors' stalls",
      "Standing weekly orders with the same vendors",
      ["A delivery fee plus a margin the vendors agree to", "draft", "pack an order Friday night"],
      "Vendor agreements and a Saturday courier pool",
      "Collect orders, consolidate per vendor, deliver Saturday morning",
      "The market association and its vendors",
      "Courier pay and packaging",
    ],
  },
  {
    slug: "forage",
    founder: "Felix Bauer",
    line: "End-of-day bakery and café surplus sold as surprise boxes before closing.",
    said: [
      "The bakery on College Avenue throws out a tray of pastries at six every night and the students upstairs are hungry.",
      "A five-dollar box of whatever is left, claimed on the phone, would clear the tray.",
    ],
    blocks: [
      "Bakeries, cafés, and delis near campus with daily surplus",
      "A surprise box of what is left, sold at a third of the price in the last hour before closing",
      ["The storefronts themselves and the student discount lists", "draft", "throws out a tray of pastries at six"],
      "Shops post daily; regulars collect most evenings",
      "A commission on each box",
      "A roster of shops and the app they post from",
      "Onboard shops, publish boxes each evening, handle pickup",
      "The downtown business association",
      "App hosting and payment fees",
    ],
  },
  {
    slug: "pantry",
    founder: "Amara Nwosu",
    line: "Meal kits sized for one with a microwave and a mini fridge.",
    said: [
      "Meal kits assume a stove, a pantry, and a family of four; a dorm has a microwave and a mini fridge.",
      "Three kits a week that need only a bowl and ten minutes would replace a lot of delivery orders.",
    ],
    blocks: [
      "Students living in dorms without kitchens who are tired of delivery",
      "Three ten-minute meals a week that need only a microwave and a bowl, delivered to the hall desk",
      "Residence hall desks and the first-year orientation packets",
      "A weekly subscription paused over breaks",
      ["A weekly subscription price under the cost of three delivery orders", "draft", "replace a lot of delivery orders"],
      "A commissary kitchen and the hall-desk delivery agreement",
      "Plan menus, prep kits, deliver to halls on a weekly route",
      ["Whether campus dining treats this as competition or a partner", "open"],
      "Food, kitchen labour, and packaging",
    ],
  },
  // Hardware and sensing.
  {
    slug: "meter",
    founder: "Pieter de Vries",
    line: "A thermostat and window sensor for drafty student rentals that split the heating bill.",
    said: [
      "A drafty student house burns four hundred dollars of gas a month and nobody knows which window is open.",
      "A cheap sensor on each window and a thermostat that drops when the house is empty would cut it by a third.",
    ],
    blocks: [
      "Students renting older houses with gas heat they pay for themselves",
      "A thermostat and window sensors that cut the heating bill by a third and tell the house what is costing them",
      "The off-campus housing fair and the landlords who manage dozens of houses",
      "Installed once per house; the bill history stays with the house",
      ["A hardware sale plus a monthly fee, or the landlord pays for the fleet", "open"],
      "A low-cost sensor kit and the thermostat firmware",
      "Install, monitor, report savings to the tenants each month",
      "Landlords with large student portfolios and the gas utility's efficiency programme",
      "Hardware and installation",
    ],
  },
  {
    slug: "beacon",
    founder: "Sofia Lindqvist",
    line: "Small trackers for the lab equipment that walks between rooms and never comes back.",
    said: [
      "A shared pipette set costs eight hundred dollars and goes missing from the bench every semester.",
      "A tracker on each kit and a map of the building would find it in a minute.",
    ],
    blocks: [
      "Lab managers in shared teaching and research buildings",
      "A tracker on every shared kit and a floor map that shows where it is right now",
      "Lab managers and the departmental purchasing office",
      "A per-building subscription with a lab-manager contact",
      ["A monthly fee per tracked item", "draft", "goes missing from the bench every semester"],
      "Low-cost trackers and the building's receiver network",
      "Tag the equipment, install receivers, keep the map live",
      "The facilities office and the environmental health and safety office",
      "Tracker hardware and the receiver network",
    ],
  },
  {
    slug: "ward",
    founder: "Jamal Robinson",
    line: "Package alerts for apartment lobbies where deliveries vanish before dinner.",
    said: [
      "In a sixty-unit student building the packages pile up in the lobby and a third are gone by evening.",
      "A camera and a text when your package lands would end the arguments with the landlord.",
    ],
    blocks: [
      "Tenants and landlords of multi-unit student buildings without a doorman",
      "A text the moment a package lands and a clip if it leaves with the wrong person",
      "Landlords with multiple buildings and the tenant union",
      "A per-building install with the landlord as the account",
      ["A monthly fee per building paid by the landlord", "draft", "a third are gone by evening"],
      "Lobby cameras and a delivery-detection model",
      "Install, detect deliveries, alert tenants, store clips for a week",
      "The large student landlords and the carriers",
      "Hardware, hosting, and clip storage",
    ],
  },
  // Creators, communities, commerce.
  {
    slug: "loop",
    founder: "Clara Fontaine",
    line: "Paid newsletters from graduate students explaining their field to people outside it.",
    said: [
      "A fifth-year in materials science explains her field better than any magazine and nobody outside her lab reads it.",
      "A thousand readers at four dollars a month would fund her last year.",
    ],
    blocks: [
      "Graduate students who can explain their research and readers outside the field who want it",
      "A paid newsletter from a researcher in the field, edited for an outside reader, with the author keeping most of the subscription",
      ["Department newsletters and the science journalism programme", "draft", "nobody outside her lab reads it"],
      "Authors publish weekly; readers subscribe per author",
      "A share of each subscription",
      "The publishing tools and the first fifty authors",
      "Recruit authors, edit the first issues, handle subscriptions",
      "The graduate school and the science communication centre",
      "Editing labour and payment processing",
    ],
  },
  {
    slug: "hive",
    founder: "Arjun Sharma",
    line: "Course communities that outlive the semester instead of dying with the discussion board.",
    said: [
      "Every course has a chat that is the most useful thing in it and it is deleted the day grades post.",
      "Keep the chat, let alumni of the course stay, and next year's students arrive to a room full of answers.",
    ],
    blocks: [
      "Students in large courses and the alumni of those courses",
      "A community per course that keeps its history, where last year's students answer this year's questions",
      ["The course syllabus and the teaching assistants", "draft", "deleted the day grades post"],
      "Rooms that persist for years; moderators drawn from past students",
      ["Whether departments pay per course or the university pays for everything", "open"],
      "The community software and the first ten course rooms",
      "Set up rooms, recruit moderators, archive each term",
      "The teaching centre and the departments with large courses",
      "Hosting and moderation",
    ],
  },
  {
    slug: "kiln",
    founder: "Beatriz Almeida",
    line: "A marketplace for student ceramics, prints, and jewellery with pickup on campus.",
    said: [
      "The ceramics studio has shelves of finished mugs that students cannot sell because shipping a mug costs more than the mug.",
      "Sell to people on campus and hand it over at the studio door.",
    ],
    blocks: [
      "Student makers in the art studios and the campus community who want their work",
      "A storefront for student-made ceramics, prints, and jewellery with pickup at the studio instead of shipping",
      ["The art department shows and the studio notice boards", "draft", "shipping a mug costs more than the mug"],
      "Makers list each term; buyers return for the holiday sale",
      "A commission on each sale",
      "The studio pickup agreement and the listing tools",
      "Photograph work, list it, run pickup hours at the studio",
      "The art department and the campus store",
      "Photography and payment fees",
    ],
  },
  {
    slug: "shelf",
    founder: "Noah Fischer",
    line: "Storefronts for one-weekend campus pop-ups that currently take cash in a shoebox.",
    said: [
      "A club bake sale or a thrift pop-up takes cash in a shoebox and runs out of change by noon.",
      "A storefront that lives for a weekend, takes cards, and closes itself would be enough.",
    ],
    blocks: [
      "Student clubs and makers running pop-up sales for a day or a weekend",
      "A storefront that opens for the weekend, takes cards and preorders, and closes itself",
      ["The student activities office event approval form", "draft", "runs out of change by noon"],
      "One storefront per event; clubs come back each term",
      "A fee per event plus payment processing",
      "The storefront builder and card readers to lend",
      "Set up the store, lend the reader, settle the money to the club",
      "The student activities office and the campus bank branch",
      "Card readers and payment fees",
    ],
  },
  {
    slug: "fold",
    founder: "Grace Okonkwo",
    line: "Interview suits rented by the week for students who own none.",
    said: [
      "A first-generation student with three interviews in October does not own a suit and cannot spend four hundred dollars on one.",
      "A suit rented for the week, tailored once, returned cleaned, for forty dollars.",
    ],
    blocks: [
      "Students interviewing for internships and jobs who do not own a suit",
      "A tailored suit rented for the interview week, cleaned and returned, at a tenth of the price of buying",
      ["The career services office and the first-generation student programme", "draft", "cannot spend four hundred dollars on one"],
      "A fitting once; rebooked for each interview season",
      "A weekly rental fee",
      "An inventory of suits across sizes and a tailor",
      "Fit, rent, clean, repair, track the inventory",
      "The career services office and a local dry cleaner",
      "Inventory, tailoring, and cleaning",
    ],
  },
  {
    slug: "pulse",
    founder: "Liam O'Connor",
    line: "Intramural fitness leaderboards that turn the gym's swipe data into house competitions.",
    said: [
      "The gym already knows who swiped in and when; the residence halls already compete over everything else.",
      "A leaderboard per hall from the swipe data would fill the gym in February.",
    ],
    blocks: [
      "Students in residence halls and the recreation department that wants them in the gym",
      "Hall-against-hall fitness competitions built from the gym swipe data students already generate",
      ["The recreation department and the residence hall councils", "draft", "The gym already knows who swiped in"],
      "A season per semester; halls defend their title",
      ["Whether the recreation department pays per season or sponsors cover prizes", "open"],
      "Access to the gym swipe data and the leaderboard app",
      "Pull swipe data, score halls, run the season and prizes",
      "The recreation department and residence life",
      "App hosting and prizes",
    ],
  },
];

export const FIRMS: CohortMember[] = FIRM_LIST.map((f, i) => member(i, f));

/** Invented abstracts, each bearing on two or three of the firms. */
export const FIRM_CORPUS: CorpusPaper[] = [
  {
    title: "Event-weekend lodging shortages in college towns and household hosting",
    abstract:
      "College towns sell out their hotel rooms months ahead of parents' weekends and commencement, and visiting families lodge an hour away. We survey faculty and staff households near twelve campuses and find substantial willingness to host visiting parents in spare rooms on those weekends, and that host vetting and a university listing raise take-up.",
    year: 2025,
    venue: "Journal of Travel Research",
    field: "Social Sciences",
  },
  {
    title: "Asking rents, paid rents, and information asymmetry in student housing markets",
    abstract:
      "Students searching for off-campus housing see only asking rents. Using crowd-sourced lease data from two campuses we show that paid rents diverge widely from asking rents across neighbourhoods, and that a map of paid rents shifts student search and lowers rents signed by first-time renters.",
    year: 2024,
    venue: "Journal of Housing Economics",
    field: "Economics",
  },
  {
    title: "Late-night campus transportation and student safety after bus service ends",
    abstract:
      "Campus bus service typically ends before libraries and laboratories close. Across six universities we document long walks and waits after midnight and evaluate peer-driver ride programmes staffed by vetted student drivers, reporting response times, ride volumes, and reported safety incidents.",
    year: 2025,
    venue: "Transportation Research Part A",
    field: "Engineering",
  },
  {
    title: "Cash handling and financial controls in student organisations",
    abstract:
      "Student clubs collect dues and event revenue in cash and change treasurers every year, and most cannot reconcile their accounts for the activities office. We examine the records of two hundred clubs and show that card collection with automatic bookkeeping reduces unexplained shortfalls and eases the annual treasurer handover.",
    year: 2023,
    venue: "Journal of Student Affairs Research",
    field: "Social Sciences",
  },
  {
    title: "Microlearning for laboratory safety retention",
    abstract:
      "Annual laboratory safety training delivered as a single session is poorly retained. We compare it with daily five-minute lessons delivered over a semester to graduate students and technicians in wet labs and find higher retention on unannounced assessments and more complete records for the safety office.",
    year: 2024,
    venue: "Journal of Chemical Health and Safety",
    field: "Chemistry",
  },
  {
    title: "Peer tutoring matched by course section in gateway courses",
    abstract:
      "Learning centres run multi-week waitlists in gateway science courses each October. We evaluate a programme that matches students to peer tutors who completed the same course section with the same instructor and report grade effects, booking repeat rates, and the cost per tutored hour.",
    year: 2025,
    venue: "Journal of College Student Retention",
    field: "Education",
  },
  {
    title: "Surplus food redistribution from bakeries and cafés at closing time",
    abstract:
      "Bakeries and cafés discard unsold goods at closing each day. We study surprise-box programmes that sell the day's surplus at a steep discount in the final hour and report the share of surplus cleared, the price point that clears it, and the effect on the shops' own waste costs.",
    year: 2024,
    venue: "Waste Management",
    field: "Environmental Science",
  },
  {
    title: "Cooking without a kitchen: meal preparation among students in residence halls",
    abstract:
      "Students in residence halls without kitchens rely on delivery and microwaveable packaged food. We survey dietary patterns in eight halls and test ten-minute meal kits designed for a microwave and a mini fridge, finding lower delivery spending and better reported diet quality among subscribers.",
    year: 2025,
    venue: "Journal of Nutrition Education and Behavior",
    field: "Medicine",
  },
  {
    title: "Heating costs in older student rental housing: sensors, thermostats, and split incentives",
    abstract:
      "Tenants in older student rentals pay for gas heat they cannot easily control. We install window sensors and occupancy-aware thermostats in forty houses and report heating-bill reductions near a third, and examine whether landlords or tenants are the better buyer given the split incentive.",
    year: 2023,
    venue: "Energy and Buildings",
    field: "Engineering",
  },
  {
    title: "Tracking shared equipment in teaching and research laboratories",
    abstract:
      "Shared laboratory equipment migrates between rooms and is lost at a steady rate each term. We attach low-cost trackers to shared kits in three buildings with a receiver network per floor and report recovery times, loss rates, and the cost of the trackers against the equipment replaced.",
    year: 2024,
    venue: "Laboratory Practice",
    field: "Biochemistry",
  },
  {
    title: "Package theft in multi-unit residential buildings without staffed lobbies",
    abstract:
      "Deliveries to multi-unit buildings without a doorman accumulate in lobbies and a substantial share are taken before the tenant collects them. We evaluate lobby cameras with delivery detection and tenant alerts in student buildings and report theft rates before and after and tenant complaints to landlords.",
    year: 2025,
    venue: "Security Journal",
    field: "Social Sciences",
  },
  {
    title: "Persistence of course discussion communities beyond the term",
    abstract:
      "Course chat communities are the most used resource in large courses and are deleted when the term ends. We keep communities open across terms with past students as moderators and measure how often incoming students find answers in prior terms' discussion and the moderation burden that results.",
    year: 2024,
    venue: "Computers and Education",
    field: "Education",
  },
  {
    title: "Interview clothing access and first-generation student job outcomes",
    abstract:
      "Students without professional clothing attend fewer interviews. We study a weekly suit-rental programme run with career services at four universities and report interview attendance, offer rates, and the inventory and cleaning costs per rental.",
    year: 2023,
    venue: "Journal of Career Development",
    field: "Social Sciences",
  },
  {
    title: "Gym attendance data and residence hall competitions",
    abstract:
      "Recreation centres record every entry swipe. We turn swipe data into hall-against-hall leaderboards over a semester at two universities and report attendance changes in the winter months, participation by hall, and the prize costs that sustain the competition.",
    year: 2025,
    venue: "Journal of American College Health",
    field: "Medicine",
  },
  {
    title: "Splitting shared household bills among student roommates",
    abstract:
      "Utilities in shared student apartments are held in one roommate's name, and late payment and disputes are common. We trial automatic bill splitting and collection across one hundred households and report on-time payment rates, late fees avoided, and roommate-reported conflict.",
    year: 2024,
    venue: "Journal of Consumer Affairs",
    field: "Economics",
  },
];
