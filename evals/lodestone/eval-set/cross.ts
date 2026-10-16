/** The ten cross-field cards: each written after its marked papers were
 *  chosen from an OpenAlex field other than the card's own, so the set holds
 *  hits a same-field ranking would miss. The ideas are invented; the papers
 *  are real (their ids are in `marks.ts`). */
import type { BlockKey } from "./marks";

export interface CrossCard {
  slug: string;
  founder: string;
  field: string;
  /** What a `forge-idea/5` card would carry: what the idea does for whom,
   *  then the same with no product or market nouns. Sent only on a
   *  `--purpose` eval run. */
  purpose: { l1: string; l2: string };
  line: string;
  said: string[];
  blocks: Record<BlockKey, string>;
}

export const CROSS_CARDS: CrossCard[] = [
  {
    // Marks: kidney exchange (Medicine), house allocation (Economics).
    slug: "swap",
    purpose: {
      l1: "Let people who each hold something they would rather trade move to what they want, even when no two of them want each other's.",
      l2: "Find exchange cycles among agents with preferences over each other's holdings when money cannot change hands.",
    },
    founder: "Tomas Okafor",
    field: "Social Sciences",
    line: "Dorm room swaps arranged in chains so three unhappy students all move at once.",
    said: [
      "Housing allows swaps but only if two students each want the other's room, so almost nobody moves.",
      "If A wants B's room, B wants C's and C wants A's, all three could move the same afternoon.",
    ],
    blocks: {
      customer_segments: "Residents assigned a room or roommate they want to leave in the first weeks of term",
      value_proposition: "Swaps found in chains of three or more, not only pairs, so far more requests are met",
      channels: "The residence life portal during the two-week room-change window",
      relationships: "One request per term; the student hears back when a chain closes",
      revenue_streams: "A licence paid by the housing office per residence hall",
      key_resources: "The list of current assignments and each student's ranked list of acceptable rooms",
      key_activities: "Collect ranked requests, find the largest set of chains, schedule the moves together",
      key_partners: "Residence life and the hall directors who sign off moves",
      cost_structure: "Integration with the housing system and the move-day coordination",
    },
  },
  {
    // Marks: outpatient overbooking and appointment reminders (Health Professions).
    slug: "nook",
    purpose: {
      l1: "Give a reserved shared space to someone waiting when the person who reserved it does not arrive.",
      l2: "Decide how far to overbook and when to release a reservation given uncertain no-shows.",
    },
    founder: "Priya Raman",
    field: "Social Sciences",
    line: "Library study rooms released to the waitlist when the booker does not show.",
    said: [
      "Every group study room is booked solid during finals and a third of them sit empty.",
      "A reminder an hour before and a ten-minute grace period would hand the empty ones to the queue.",
    ],
    blocks: {
      customer_segments: "Students who need a group study room in the last weeks of the semester",
      value_proposition: "Booked rooms that stay empty are handed to the next group within ten minutes",
      channels: "The library's room-booking page and its mobile app",
      relationships: "Bookers get a reminder; repeat no-shows lose priority",
      revenue_streams: "An annual fee from the library for the booking system",
      key_resources: "Room door sensors and the booking history with each user's attendance",
      key_activities: "Send reminders, detect empty rooms, release them, and decide how far to overbook",
      key_partners: "The university library and facilities",
      cost_structure: "Sensors, messaging, and integration with the booking system",
    },
  },
  {
    // Marks: predictive maintenance by machine learning (Engineering).
    slug: "spin",
    purpose: {
      l1: "Repair shared machines before they stop working instead of after.",
      l2: "Predict equipment failure from usage and error records early enough to schedule maintenance.",
    },
    founder: "Hannah Brooks",
    field: "Business, Management and Accounting",
    line: "Laundry machines in the residence halls fixed before they break, not after a week of out-of-order signs.",
    said: [
      "A broken washer stays broken for a week because nobody reports it until the sign goes up.",
      "The machines already log every cycle; the ones about to fail look different weeks ahead.",
    ],
    blocks: {
      customer_segments: "Campus laundry operators who run the machines in every residence hall",
      value_proposition: "Machines flagged for service before they fail, so fewer are out of order",
      channels: "Sold to the laundry contractor that holds the campus concession",
      relationships: "A weekly service list and a monthly uptime report",
      revenue_streams: "A fee per machine per month",
      key_resources: "Cycle logs, error codes, and repair history from each machine",
      key_activities: "Learn which patterns precede a failure and schedule the repair visit",
      key_partners: "The laundry contractor and its service technicians",
      cost_structure: "Data connections to the machines and model upkeep",
    },
  },
  {
    // Marks: the WHO surgical safety checklist trial and its meta-analysis (Health Professions).
    slug: "preflight",
    purpose: {
      l1: "Have the people running a risky event confirm the known hazards aloud before it starts.",
      l2: "Reduce harm in a team procedure with a short spoken checklist before the critical step.",
    },
    founder: "Marcus Lee",
    field: "Social Sciences",
    line: "A short sign-off checklist student clubs run before every large party or event.",
    said: [
      "Most incidents at club events are things someone knew about and nobody said out loud.",
      "A two-minute checklist read aloud by the organisers before doors open would catch most of them.",
    ],
    blocks: {
      customer_segments: "Student organisations that host events with more than fifty people",
      value_proposition: "A two-minute read-aloud checklist before doors open that cuts incidents",
      channels: "Required in the event registration with the student activities office",
      relationships: "Each event's checklist is signed and kept; the office sees completion rates",
      revenue_streams: "A licence paid by student affairs or the risk management office",
      key_resources: "The checklist itself and incident reports to refine it",
      key_activities: "Write and revise the checklist, train organisers, record each sign-off",
      key_partners: "Student activities, campus police, and risk management",
      cost_structure: "Training sessions and a small app",
    },
  },
  {
    // Marks: school start times and adolescent sleep (Psychology).
    slug: "dawn",
    purpose: {
      l1: "Keep the youngest learners out of the earliest time slots.",
      l2: "Schedule required activities to fit the sleep timing of adolescents and young adults.",
    },
    founder: "Elif Demir",
    field: "Social Sciences",
    line: "Course timetables built so first-years are not stuck in 8 a.m. sections.",
    said: [
      "First-years get whatever is left at registration, which is the eight o'clock sections.",
      "Their grades in those sections are worse, and it is not the course.",
    ],
    blocks: {
      customer_segments: "Registrars scheduling large introductory courses with many sections",
      value_proposition: "A timetable that moves first-year sections out of the earliest slots",
      channels: "Sold to the registrar's office alongside its scheduling software",
      relationships: "Re-run each term with the new enrolment numbers",
      revenue_streams: "An annual licence per campus",
      key_resources: "Section enrolments, room capacities, and grades by section time",
      key_activities: "Re-solve the timetable with a penalty on early slots for first-year sections",
      key_partners: "The registrar and the departments that teach the large courses",
      cost_structure: "Solver development and integration with the student information system",
    },
  },
  {
    // Marks: newsvendor decision bias and the data-driven newsvendor (Business).
    slug: "slice",
    purpose: {
      l1: "Order the right amount of a perishable good for a group whose turnout is uncertain.",
      l2: "Choose a single order quantity under uncertain demand when both shortage and leftover cost something.",
    },
    founder: "Diego Alvarez",
    field: "Social Sciences",
    line: "How much pizza to order for a club meeting, from who said they would come.",
    said: [
      "Every club either runs out of food in ten minutes or throws away half of it.",
      "The RSVPs tell you something, but not the number that will turn up.",
    ],
    blocks: {
      customer_segments: "Officers of student clubs that feed their meetings and events",
      value_proposition: "The quantity to order for each event, so less food is wasted and nobody goes without",
      channels: "The club event page where RSVPs are already collected",
      relationships: "Each event's actual turnout improves the next order",
      revenue_streams: "A share of the order placed through partner restaurants",
      key_resources: "RSVP counts and actual turnout for past events",
      key_activities: "Forecast turnout from RSVPs and set the order against the cost of running short",
      key_partners: "Local pizza and catering restaurants",
      cost_structure: "Forecast model and the ordering integration",
    },
  },
  {
    // Marks: noise effects on learning and background-noise distraction (Health Professions).
    slug: "hush",
    purpose: {
      l1: "Show people where they can work without being distracted by noise.",
      l2: "Reduce the effect of background noise and speech on concentration and learning.",
    },
    founder: "Grace Whitfield",
    field: "Social Sciences",
    line: "A live map of the quietest open seats in the library.",
    said: [
      "You walk three floors looking for a seat and the only free one is next to a group talking.",
      "Sound sensors on each floor could show which seats are actually quiet right now.",
    ],
    blocks: {
      customer_segments: "Students studying alone in the library who need a quiet seat",
      value_proposition: "A live map of where it is quiet and where seats are free",
      channels: "The library website and screens at each entrance",
      relationships: "Checked each visit; no account needed",
      revenue_streams: "A fee from the library for the sensors and map",
      key_resources: "Sound-level sensors and seat occupancy sensors on each floor",
      key_activities: "Measure sound and occupancy, update the map, report noisy zones to staff",
      key_partners: "The library and campus IT",
      cost_structure: "Sensors, installation, and hosting",
    },
  },
  {
    // Marks: reusable-cup messaging trial and cup life-cycle performance (Environmental Science).
    slug: "tumbler",
    purpose: {
      l1: "Replace disposable containers with shared reusable ones that can be returned anywhere.",
      l2: "Shift consumers from single-use to reusable items and know when reuse actually lowers environmental impact.",
    },
    founder: "Sofia Lindqvist",
    field: "Business, Management and Accounting",
    line: "A deposit cup shared across every campus café, returned at any of them.",
    said: [
      "Campus cafés go through thousands of paper cups a day and the discount for bringing your own barely moves it.",
      "A one-dollar deposit cup you can drop at any café would be easier than remembering your own.",
    ],
    blocks: {
      customer_segments: "Campus cafés and dining services that sell hot drinks to go",
      value_proposition: "A shared deposit cup accepted at every café, replacing disposable cups",
      channels: "Dining services, which runs most of the cafés",
      relationships: "Cafés stay in the scheme; students carry the cup between them",
      revenue_streams: "A fee per cup use paid by the café, plus unreturned deposits",
      key_resources: "The cup stock, return bins, and a central washing arrangement",
      key_activities: "Collect returned cups, wash them, and redistribute to each café",
      key_partners: "Dining services and the campus sustainability office",
      cost_structure: "Cups, washing, and collection runs",
    },
  },
  {
    // Marks: wireless and IoT cold-chain monitoring (Agricultural and Biological Sciences).
    slug: "chill",
    purpose: {
      l1: "Prove that donated food was kept cold the whole time it sat out.",
      l2: "Monitor temperature continuously across a cold chain and act on excursions.",
    },
    founder: "Kwame Asante",
    field: "Business, Management and Accounting",
    line: "Temperature sensors for the community fridges where dining halls leave unsold food.",
    said: [
      "The dining halls want to leave leftovers in community fridges but cannot vouch the food stayed cold.",
      "A sensor in each fridge with an alert would let them sign off on it.",
    ],
    blocks: {
      customer_segments: "Dining services and student groups running community fridges on campus",
      value_proposition: "Each fridge's temperature logged and alerted, so donated food can be trusted",
      channels: "Campus sustainability and the basic-needs office",
      relationships: "Alerts to the fridge's volunteer steward; a monthly log for dining services",
      revenue_streams: "A monthly fee per fridge paid by dining services",
      key_resources: "Wireless temperature and door sensors in each fridge",
      key_activities: "Monitor, alert the steward, and flag food to be discarded after an excursion",
      key_partners: "Dining services and environmental health and safety",
      cost_structure: "Sensors and the alerting service",
    },
  },
  {
    // Marks: pedestrian crowd dynamics and walking groups (Engineering).
    slug: "movein",
    purpose: {
      l1: "Stop crowds jamming narrow passages when everyone arrives at once.",
      l2: "Stagger arrivals to keep pedestrian flow moving through bottlenecks.",
    },
    founder: "Lena Hoffmann",
    field: "Social Sciences",
    line: "Move-in day arrival slots so hall stairwells and lifts do not jam.",
    said: [
      "On move-in day every family arrives at ten and the stairwells are solid with people and boxes.",
      "Staggered slots by floor would keep people moving.",
    ],
    blocks: {
      customer_segments: "Residence life offices running move-in for thousands of first-years",
      value_proposition: "Arrival slots by hall and floor that keep stairwells and lifts moving",
      channels: "The housing assignment email each student already receives",
      relationships: "Used once a year; refined with each year's arrival data",
      revenue_streams: "A per-event fee from residence life",
      key_resources: "Floor plans, stairwell and lift capacity, and the assignment list",
      key_activities: "Simulate the flow of families and boxes and set the slots",
      key_partners: "Residence life, parking services, and the move-in volunteers",
      cost_structure: "Simulation work and messaging",
    },
  },
];
