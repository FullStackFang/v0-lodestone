/** The weekly digest: what arrived since a date that bears on each of a
 *  member's cards. Retrieval and ranking only — every row is a stored record
 *  plus the block names it matched on, and no sentence is written for it. */
import type { Db } from "@/db/client";
import type { ForgeCardRow } from "@/db/lodestone-schema";
import { embed } from "@/harness/embed";
import { cardsForOwner, cohortCards, type CohortCard, type Embedder } from "./cards";
import { peersFor, type PeerHit } from "./peers";
import { priorArtForMany, type PaperHit } from "./priorArt";
import { withSentences } from "./sentences";
import { ideaVectors, type IdeaVector } from "./vectors";
import { isActiveMember } from "@/pilot/membership";

export interface DigestSection {
  ideaId: string;
  title: string;
  /** Cohort cards published since the date, best match first. */
  peers: PeerHit[];
  /** Papers added since the date that sit close to the card. */
  papers: PaperHit[];
}

export interface Digest {
  since: Date;
  until: Date;
  /** Cards published to the cohort since the date, for the no-card case. */
  newCards: number;
  sections: DigestSection[];
}

export const DIGEST_DAYS = 7;
/** Below this a paper is noise, not a digest row. */
export const PAPER_FLOOR = 0.75;

/** A caller that already read any of these passes it, and it is not read
 *  again: the page renders the same rows, the cron shares one cohort. */
export interface DigestOptions {
  /** The lowest paper score worth a row. Defaults to `PAPER_FLOOR`. */
  paperFloor?: number;
  /** The person's own cards, newest first, as `cardsForOwner` lists them. */
  cards?: ForgeCardRow[];
  /** Every cohort card, as `cohortCards` lists them. */
  cohort?: CohortCard[];
  /** Whether the person is an active member. */
  member?: boolean;
  /** Vectors for at least the person's cards and the cohort's. */
  vectors?: Map<string, IdeaVector[]>;
  /** Embeds sentences of papers not yet cut. Defaults to Voyage. */
  embed?: Embedder;
}

export function weekAgo(now = new Date()): Date {
  return new Date(now.getTime() - DIGEST_DAYS * 24 * 60 * 60 * 1000);
}

export async function digestFor(db: Db, personId: string, since: Date, now = new Date(), options: DigestOptions = {}): Promise<Digest> {
  const floor = options.paperFloor ?? PAPER_FLOOR;
  const [mine, cohort, member] = await Promise.all([
    options.cards ?? cardsForOwner(db, personId),
    options.cohort ?? cohortCards(db),
    // Only a member sees the cohort's cards; anyone with a card sees the corpus.
    options.member ?? isActiveMember(db, personId),
  ]);
  const recent = cohort.filter((c) => c.card.publishedAt && c.card.publishedAt >= since && c.owner.id !== personId);
  const matching = member && recent.length > 0;
  const ids = mine.map((c) => c.ideaId);
  // One read serves the prior art and, for a member, every card's peers.
  const vectors = options.vectors ?? (await ideaVectors(db, matching ? [...ids, ...recent.map((c) => c.card.ideaId)] : ids));
  const [papersByCard, peersByCard] = await Promise.all([
    // The person owns every card here, so their verdicts shape each list.
    priorArtForMany(db, ids, 5, { since, viewerId: personId, vectors, cards: mine }),
    Promise.all(mine.map((card) => (matching ? peersFor(db, card.ideaId, 5, recent, vectors) : []))),
  ]);
  const sections: DigestSection[] = await Promise.all(mine.map(async (card, at) => ({
    ideaId: card.ideaId,
    title: card.title,
    peers: peersByCard[at],
    papers: await withSentences(db, options.embed ?? embed, card.ideaId, (papersByCard.get(card.ideaId) ?? []).filter((p) => p.score >= floor)),
  })));
  return { since, until: now, newCards: recent.length, sections };
}

/** The digest as plain text, for the mail path. */
export function renderDigest(digest: Digest, origin = ""): string {
  const lines: string[] = [];
  const d = (x: Date) => x.toISOString().slice(0, 10);
  lines.push(`Lodestone digest · ${d(digest.since)} to ${d(digest.until)}`);
  lines.push(`${digest.newCards} card${digest.newCards === 1 ? "" : "s"} published to the cohort this week.`);
  for (const s of digest.sections) {
    lines.push("");
    lines.push(`${s.title}`);
    if (s.peers.length === 0 && s.papers.length === 0) {
      lines.push("  nothing new bears on this card");
      continue;
    }
    for (const p of s.peers) {
      const shared = p.shared.length ? p.shared.map((b) => b.mine).join(", ") : "no block within reach";
      lines.push(`  new card · ${p.title} · ${p.owner.name} · shares ${shared} · ${origin}/lodestone/cards/${p.ideaId}`);
    }
    for (const p of s.papers) {
      lines.push(`  corpus · ${p.kind === "patent" ? "Patent · " : ""}${p.title}${p.year ? ` (${p.year})` : ""} · closest to ${p.blocks.join(", ")} · ${p.score.toFixed(2)}`);
    }
  }
  return lines.join("\n");
}
