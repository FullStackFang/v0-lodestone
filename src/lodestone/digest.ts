/** The weekly digest: what arrived since a date that bears on each of a
 *  member's cards. Retrieval and ranking only — every row is a stored record
 *  plus the block names it matched on, and no sentence is written for it. */
import type { Db } from "@/db/client";
import { cardsForOwner, cohortCards } from "./cards";
import { peersFor, type PeerHit } from "./peers";
import { priorArtFor, type PaperHit } from "./priorArt";

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

export interface DigestOptions {
  /** The lowest paper score worth a row. Defaults to `PAPER_FLOOR`. */
  paperFloor?: number;
}

export function weekAgo(now = new Date()): Date {
  return new Date(now.getTime() - DIGEST_DAYS * 24 * 60 * 60 * 1000);
}

export async function digestFor(db: Db, personId: string, since: Date, now = new Date(), options: DigestOptions = {}): Promise<Digest> {
  const floor = options.paperFloor ?? PAPER_FLOOR;
  const mine = await cardsForOwner(db, personId);
  const recent = (await cohortCards(db)).filter((c) => c.card.publishedAt && c.card.publishedAt >= since && c.owner.id !== personId);
  const sections: DigestSection[] = [];
  for (const card of mine) {
    const peers = recent.length ? await peersFor(db, card.ideaId, 5, recent) : [];
    const papers = (await priorArtFor(db, card.ideaId, 5, since)).filter((p) => p.score >= floor);
    sections.push({ ideaId: card.ideaId, title: card.title, peers, papers });
  }
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
