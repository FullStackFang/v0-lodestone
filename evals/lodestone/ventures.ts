/** A demo cohort of real ideas: twelve Y Combinator companies in three
 *  themes (renting, food waste, research tools), four to a theme so every
 *  card has peers and the map has regions. Each card is drafted from the
 *  company's public YC directory description, read from the yc-oss mirror
 *  (yc-oss.github.io/api) on 2026-10-17. `said` quotes that description
 *  verbatim; a block it states is a `draft` resting on one of those quotes,
 *  and a block it does not state is `open`. Nothing is `confirmed`: no
 *  founder has marked these.
 *
 *  The members are the companies, not people: each is named by its YC batch
 *  (the card title is the company) and the address is under
 *  `yc-ventures.test`. There is no corpus here; prior art is real OpenAlex
 *  papers, one query set per theme, e.g.
 *  `npm run lodestone:ingest -- --source openalex --since 2015 --limit 40
 *  --set food-waste --query "food waste surplus redistribution perishable demand forecasting"`.
 *  Loaded with `npm run lodestone:seed -- --set ventures`. */
import type { CohortMember } from "./cohort";

type Block = [text: string, origin: "open"] | [text: string, origin: "draft", evidence: string];

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

interface Venture {
  slug: string;
  name: string;
  batch: string;
  line: string;
  said: string[];
  blocks: [Block, Block, Block, Block, Block, Block, Block, Block, Block];
}

function member(index: number, v: Venture): CohortMember {
  return {
    name: `YC ${v.batch}`,
    email: `${v.slug}@yc-ventures.test`,
    ideaId: hex(0xc00 + index),
    title: v.name,
    line: v.line,
    said: v.said,
    entries: v.blocks.map(([text, origin, evidence], i) => ({ block: ORDER[i], text, origin, evidence })),
  };
}

const LIST: Venture[] = [
  // Renting.
  {
    slug: "kopa",
    name: "Kopa",
    batch: "W19",
    line: "Find furnished rentals and compatible housemates for 1-12 month stays.",
    said: [
      "Kopa is the marketplace for monthly rentals and compatible housemates.",
      "Kopa enables people to browse rentals, find roommates, and book and pay for spaces all online.",
    ],
    blocks: [
      ["People moving for one to twelve months who need a furnished place and housemates", "draft", "monthly rentals and compatible housemates"],
      ["Furnished monthly rentals and compatible housemates, browsed, booked and paid for online", "draft", "browse rentals, find roommates, and book and pay for spaces all online"],
      ["How renters first hear of it", "open"],
      ["Housemates matched for compatibility, so the stay becomes a community", "draft", "compatible housemates"],
      ["Whether the take is a booking fee, a share of rent, or a host listing fee", "open"],
      ["The supply of furnished monthly listings", "draft", "the marketplace for monthly rentals"],
      ["Run the marketplace, match housemates, take booking and payment online", "draft", "book and pay for spaces all online"],
      ["Which landlords and furnished-housing operators list", "open"],
      ["Payments and trust and safety for strangers living together", "open"],
    ],
  },
  {
    slug: "homeroom",
    name: "HomeRoom",
    batch: "W22",
    line: "Rent houses by the room so young renters pay less and investors earn more.",
    said: [
      "We help investors buy homes in cities that are attractive to young people, but lack affordable housing options.",
      "Our average rent across every property is $458, which is about 50% lower than market comps, and our investors see returns up to 50% higher.",
      "We do this by sourcing properties, arranging capital, managing construction, vetting tenants and collecting rent by the room.",
    ],
    blocks: [
      ["Young renters in cities short of affordable housing, and the property investors who house them", "draft", "cities that are attractive to young people, but lack affordable housing options"],
      ["A room at about half the market rent; for the investor, returns up to half again higher", "draft", "about 50% lower than market comps, and our investors see returns up to 50% higher"],
      ["How investors and renters are found", "open"],
      ["A managed house: tenants vetted, rent collected by the room", "draft", "vetting tenants and collecting rent by the room"],
      ["A share of rent collected per room", "draft", "collecting rent by the room"],
      ["Investor capital and a pipeline of homes in the right cities", "draft", "sourcing properties, arranging capital"],
      ["Source the house, arrange capital, renovate, vet tenants, collect rent", "draft", "sourcing properties, arranging capital, managing construction, vetting tenants and collecting rent by the room"],
      ["Property investors", "draft", "We help investors buy homes"],
      ["Renovation crews and property management", "draft", "managing construction"],
    ],
  },
  {
    slug: "goodcover",
    name: "Goodcover",
    batch: "S17",
    line: "Co-op renters insurance at half the price, with a dividend of what is left after claims.",
    said: [
      "Goodcover provides its Members with Good Renters Insurance for 50% less than legacy companies and an Annual Dividend of the money left over after claims obligations are met.",
      "Member's premiums are pooled and used to pay claims. We take a fixed fee, and the remainder is returned in our Annual Member Dividend.",
      "As an Invitation Only Membership served by an MGA, we can give Members Free Insurance when they invite others.",
    ],
    blocks: [
      ["Renters who need contents and liability insurance", "draft", "Good Renters Insurance"],
      ["Renters insurance at about half the price, and a yearly dividend of what claims did not use", "draft", "50% less than legacy companies and an Annual Dividend"],
      ["Members invite members; the invitation replaces the marketing budget", "draft", "give Members Free Insurance when they invite others"],
      ["A membership that pools premiums and shares the remainder", "draft", "premiums are pooled and used to pay claims"],
      ["A fixed fee on pooled premiums", "draft", "We take a fixed fee"],
      ["A multiperil pricing model and capital partners", "open"],
      ["Price risk, administer policies as an MGA, pay claims, return the dividend", "draft", "served by an MGA"],
      ["Capital partners who carry the risk", "open"],
      ["Claims, the fixed administration cost, and regulatory compliance", "open"],
    ],
  },
  {
    slug: "trigo",
    name: "Trigo",
    batch: "W23",
    line: "A rent-history API so landlords approve better tenants and lenders write more loans.",
    said: [
      "Trigo aggregates consumer rent history to help landlords approve better tenants and lenders write more loans.",
      "The largest database has only 3% coverage of rent data.",
      "Trigo is a Consumer Reporting Agency (CRA) that provides this missing rent data set through a real-time API and web application.",
    ],
    blocks: [
      ["Landlords screening tenants and lenders underwriting renters", "draft", "help landlords approve better tenants and lenders write more loans"],
      ["Verified rent history where today's largest database covers three percent", "draft", "The largest database has only 3% coverage of rent data"],
      ["A real-time API and a web application", "draft", "through a real-time API and web application"],
      ["Integrated into the screening and underwriting flow", "open"],
      ["Whether priced per report or per API call", "open"],
      ["The aggregated rent-history data set", "draft", "aggregates consumer rent history"],
      ["Aggregate rent history and furnish it as a consumer reporting agency", "draft", "a Consumer Reporting Agency (CRA)"],
      ["Where the rent data comes from: renters, landlords, or payment processors", "open"],
      ["Data acquisition and consumer-reporting compliance", "open"],
    ],
  },
  // Food waste.
  {
    slug: "copia",
    name: "Copia",
    batch: "W16",
    line: "Surplus food from cafeterias, universities and caterers, picked up and delivered to nonprofits.",
    said: [
      "Hunger is not a scarcity problem; it's a logistics problem.",
      "Copia is a for-profit company that has built technology allowing businesses (e.g., food management companies like Compass Group, corporate cafeterias, universities, hospitals, grocers, caterers, etc.) to easily request pickups of their surplus food, have it matched, and safely delivered to non-profits in need.",
      "With Copia, partnering businesses can seamlessly access significant tax savings, dramatically reduce food waste through data and analytics on surplus, and remove CO2 from the atmosphere, all while feeding their community.",
    ],
    blocks: [
      ["Food businesses with surplus: cafeterias, universities, hospitals, grocers, caterers", "draft", "corporate cafeterias, universities, hospitals, grocers, caterers"],
      ["Surplus picked up and delivered to nonprofits, with the tax saving and data on what is wasted", "draft", "access significant tax savings, dramatically reduce food waste through data and analytics on surplus"],
      ["Food management companies that run many sites at once", "draft", "food management companies like Compass Group"],
      ["Request a pickup whenever there is surplus", "draft", "easily request pickups of their surplus food"],
      ["Whether businesses pay per pickup or out of the tax saving", "open"],
      ["The matching technology and the nonprofit network", "draft", "have it matched, and safely delivered to non-profits in need"],
      ["Match surplus to a nonprofit, deliver it safely, report on it", "draft", "have it matched, and safely delivered"],
      ["Nonprofits that receive the food", "draft", "non-profits in need"],
      ["Pickup and delivery logistics", "draft", "it's a logistics problem"],
    ],
  },
  {
    slug: "perfekto",
    name: "Perfekto",
    batch: "S21",
    line: "A grocery subscription box of imperfect and surplus food, home-delivered.",
    said: [
      "Over 1/3 of food is being thrown away and in Latin America 72% of it prior to the consumer stage.",
      "Perfekto offers a grocery subscription box with imperfect and surplus food, home-delivered.",
      "Thereby, consumers save time and money while reducing food waste.",
    ],
    blocks: [
      ["Households in Latin America who buy groceries", "draft", "in Latin America"],
      ["Imperfect and surplus food at a lower price, delivered home", "draft", "consumers save time and money while reducing food waste"],
      ["How subscribers are found", "open"],
      ["A recurring box", "draft", "a grocery subscription box"],
      ["Subscription box sales", "draft", "a grocery subscription box"],
      ["Supply of produce rejected for looks or overproduced", "draft", "imperfect and surplus food"],
      ["Buy the rejected supply, pack the boxes, deliver", "draft", "home-delivered"],
      ["Growers and food brands with surplus", "open"],
      ["Sourcing, packing and last-mile delivery", "draft", "home-delivered"],
    ],
  },
  {
    slug: "shelf-engine",
    name: "Shelf Engine",
    batch: "S18",
    line: "Predict the right amount of perishable goods to order, so stores sell more and waste less.",
    said: [
      "Shelf Engine helps businesses increase sales by accurately predicting the perfect amount of perishable goods to order, thus reducing food waste.",
    ],
    blocks: [
      ["Grocery stores ordering highly perishable foods", "draft", "the perfect amount of perishable goods to order"],
      ["The right order quantity for each perishable item: more sales and less waste", "draft", "increase sales by accurately predicting the perfect amount"],
      ["How stores are sold", "open"],
      ["Ordering handed over to the forecast", "open"],
      ["Whether paid per order, per store, or from the waste saved", "open"],
      ["The demand forecasting model and store sales data", "draft", "accurately predicting the perfect amount"],
      ["Forecast demand and set the order", "draft", "predicting the perfect amount of perishable goods to order"],
      ["Perishable suppliers", "open"],
      ["Data and modelling", "open"],
    ],
  },
  {
    slug: "guac",
    name: "Guac",
    batch: "S23",
    line: "AI demand forecasting and replenishment for supermarkets.",
    said: [
      "Guac accurately forecasts grocery demand to help supermarkets order and produce the right amount of inventory — reducing food waste and increasing availability.",
    ],
    blocks: [
      ["Supermarkets ordering and producing fresh inventory", "draft", "help supermarkets order and produce the right amount of inventory"],
      ["Less food waste and fewer empty shelves", "draft", "reducing food waste and increasing availability"],
      ["How supermarkets are reached", "open"],
      ["Replenishment run on the forecast", "open"],
      ["Whether a software subscription per store", "open"],
      ["The grocery demand forecast", "draft", "accurately forecasts grocery demand"],
      ["Forecast demand, set orders and in-store production", "draft", "order and produce the right amount of inventory"],
      ["Point-of-sale and inventory system vendors", "open"],
      ["Data and modelling", "open"],
    ],
  },
  // Research tools.
  {
    slug: "undermind",
    name: "Undermind",
    batch: "S24",
    line: "A search agent for scientific literature that explores the way a careful researcher does.",
    said: [
      "It's geared at experts, like research scientists and doctors, who need to find very specific resources to solve high-stakes problems.",
      "Our new approach employs high-quality LLMs to adaptively explore a database, mimicking how a human researcher carefully discovers information.",
      "Our first target users are the 50 million researchers searching for scientific literature on PubMed and Google Scholar every month.",
    ],
    blocks: [
      ["Research scientists and doctors searching for very specific literature", "draft", "experts, like research scientists and doctors, who need to find very specific resources"],
      ["Answers to complex search questions, found the way a careful researcher would", "draft", "mimicking how a human researcher carefully discovers information"],
      ["Researchers already on PubMed and Google Scholar", "draft", "searching for scientific literature on PubMed and Google Scholar every month"],
      ["Self-serve accounts", "open"],
      ["Paid user subscriptions", "open"],
      ["LLMs that adaptively explore a literature database", "draft", "employs high-quality LLMs to adaptively explore a database"],
      ["Run the search agent over the literature", "draft", "adaptively explore a database"],
      ["Literature databases and model providers", "open"],
      ["Model inference per search", "open"],
    ],
  },
  {
    slug: "anara",
    name: "Anara",
    batch: "S24",
    line: "AI that helps researchers find, understand and write scientific documents.",
    said: [
      "We help researchers find, understand and write scientific documents, together.",
      "we've grown to 3M users spanning hundreds of major colleges and research-led companies,",
      "600M+ people have seen our content across Instagram, TikTok and YouTube,",
    ],
    blocks: [
      ["Students and researchers at colleges and research-led companies", "draft", "hundreds of major colleges and research-led companies"],
      ["One tool to find, understand and write scientific documents", "draft", "find, understand and write scientific documents"],
      ["Short-form content on Instagram, TikTok and YouTube", "draft", "across Instagram, TikTok and YouTube"],
      ["Shared work on documents", "draft", "scientific documents, together"],
      ["User subscriptions", "open"],
      ["The user base and the content audience", "draft", "3M users"],
      ["Build the reading and writing tools; make the content", "open"],
      ["Universities", "open"],
      ["Model inference and content production", "open"],
    ],
  },
  {
    slug: "answerthis",
    name: "AnswerThis",
    batch: "F25",
    line: "A workspace that finds papers, connects them and drafts literature reviews.",
    said: [
      "Instead of manually searching, reading, and organizing dozens of papers, researchers use AnswerThis to find the most relevant work, see how ideas are connected, and get comprehensive answers to complex scientific questions with line by line answers.",
      "This allows them to map research gaps, analyze trends, and draft literature reviews far faster, all while building a searchable library of their own research materials.",
    ],
    blocks: [
      ["Researchers who search, read and organise dozens of papers", "draft", "manually searching, reading, and organizing dozens of papers"],
      ["Weeks of literature work in hours: relevant work found, connections shown, gaps mapped", "draft", "map research gaps, analyze trends, and draft literature reviews far faster"],
      ["How researchers find it", "open"],
      ["A library of the researcher's own materials that grows with use", "draft", "building a searchable library of their own research materials"],
      ["User subscriptions", "open"],
      ["The paper index and the connection map", "draft", "see how ideas are connected"],
      ["Find, connect and answer with line-by-line citations", "draft", "line by line answers"],
      ["Literature databases and model providers", "open"],
      ["Model inference per question", "open"],
    ],
  },
  {
    slug: "et-al",
    name: "et al.",
    batch: "S24",
    line: "A feed of short insights extracted from your newsletters, papers and articles.",
    said: [
      "et al. is a mobile app that aggregates your newsletters, research papers, articles, and more, in one place.",
      "We extract key takeaways from long-form content - allowing you to read as little or as much as you like from the original piece of information.",
      "With et al., you get to stay on top of breakthroughs in your field, build knowledge, and discover new interests effortlessly.",
    ],
    blocks: [
      ["People who need to keep up with a fast field", "draft", "stay on top of breakthroughs in your field"],
      ["Key takeaways from long-form sources, read as deep as you like", "draft", "read as little or as much as you like"],
      ["A mobile app", "draft", "a mobile app"],
      ["A daily feed that learns your sources", "draft", "aggregates your newsletters, research papers, articles, and more, in one place"],
      ["Whether subscription or free", "open"],
      ["Aggregation across newsletters, papers and articles", "draft", "aggregates your newsletters, research papers, articles"],
      ["Extract takeaways with LLMs and rank the feed", "draft", "We extract key takeaways from long-form content"],
      ["Publishers and newsletter authors", "open"],
      ["Model inference per item", "open"],
    ],
  },
];

export const VENTURES: CohortMember[] = LIST.map((v, n) => member(n, v));
