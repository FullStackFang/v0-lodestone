/** The field around a card: its peers in the cohort and its prior art in
 *  the corpus as one list, closest first, each marked against the neighbour
 *  line. Retrieval only; every node is a stored record and a cosine. */
import type { Db } from "@/db/client";
import { canView, cardById } from "./cards";
import { CLOSE } from "./geometry";
import { peersFor } from "./peers";
import { priorArtFor } from "./priorArt";
import { isActiveMember } from "@/pilot/membership";
import { ideaVectors } from "./vectors";

export interface FieldNode {
  id: string;
  kind: "peer" | "paper" | "patent";
  title: string;
  meta: string;
  score: number;
  close: boolean;
  href: string | null;
  /** The peer's card, for a `peer` node. */
  ideaId?: string;
}

export interface Field {
  center: { ideaId: string; title: string; owner: string; mine: boolean };
  nodes: FieldNode[];
  /** The neighbour line: `CLOSE`. */
  line: number;
  member: boolean;
  hasVectors: boolean;
}

/** Null when the card does not exist or the viewer may not see it. Peers
 *  come only to an active member; prior art comes to anyone who can view. */
export async function fieldFor(db: Db, viewerId: string, ideaId: string, k = 8): Promise<Field | null> {
  const found = await cardById(db, ideaId);
  if (!found || !(await canView(db, viewerId, found.card))) return null;
  const member = await isActiveMember(db, viewerId);
  const [peers, papers, vectors] = await Promise.all([
    member ? peersFor(db, ideaId, k) : Promise.resolve([]),
    priorArtFor(db, ideaId, k),
    ideaVectors(db, [ideaId]),
  ]);
  const nodes: FieldNode[] = [
    ...peers.map((p): FieldNode => ({
      id: `peer:${p.ideaId}`, kind: "peer", title: p.title, meta: p.owner.name, score: p.score, close: p.score >= CLOSE,
      href: `/lodestone/cards/${p.ideaId}`, ideaId: p.ideaId,
    })),
    ...papers.map((p): FieldNode => ({
      id: `doc:${p.documentId}`, kind: p.kind === "patent" ? "patent" : "paper", title: p.title,
      meta: [p.venue, p.year].filter(Boolean).join(" · "), score: p.score, close: p.score >= CLOSE, href: p.url,
    })),
  ].sort((a, b) => b.score - a.score);
  return {
    center: { ideaId, title: found.card.title, owner: found.owner.name, mine: found.card.ownerId === viewerId },
    nodes,
    line: CLOSE,
    member,
    hasVectors: (vectors.get(ideaId) ?? []).length > 0,
  };
}
