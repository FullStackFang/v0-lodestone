/** A Forge card in the network: import, visibility, and who may read it.
 *
 * The card is the export document, whole. The ledger rows beneath it are
 * `projectForgeIdea`'s, filed on the owner's own person row so a member's
 * profile facts and their card share a subject. Embedding happens on import,
 * through the platform's embedder: the card is already on the server, and a
 * private card still needs vectors for the prior-art match that works at
 * zero density. Nothing here is visible to another member until the owner
 * chooses `cohort`, and `private` is one action away at any time. */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { forgeCard, type ForgeCardRow, type ForgeCardVisibility } from "@/db/lodestone-schema";
import { person, pilotMembership } from "@/db/schema";
import type { EmbedResult } from "@/harness/embed";
import {
  embedForgeRows,
  parseForgeIdea,
  pendingEmbeds,
  projectForgeIdea,
  type ForgeImportReport,
} from "@/harness/founder/forge";
import type { PilotMembership } from "@/db/pilot-schema";
import { assertActiveMember, isActive, isActiveMember } from "@/pilot/membership";

export type Embedder = (texts: string[], inputType?: "document" | "query") => Promise<EmbedResult>;

export const BLOCKS = [
  ["key_partners", "Key partners"],
  ["key_activities", "Key activities"],
  ["key_resources", "Key resources"],
  ["value_proposition", "Value proposition"],
  ["relationships", "Relationships"],
  ["channels", "Channels"],
  ["customer_segments", "Customer segments"],
  ["cost_structure", "Cost structure"],
  ["revenue_streams", "Revenue streams"],
] as const;

export function blockLabel(key: string): string {
  return BLOCKS.find(([k]) => k === key)?.[1] ?? key.replaceAll("_", " ");
}

export interface CardEntry {
  text: string;
  origin: "confirmed" | "draft" | "open";
  evidence: string | null;
  segment: string | null;
}

export interface CardBlock {
  key: string;
  label: string;
  entries: CardEntry[];
}

/** The nine blocks of the card's Business Model workspace, in grid order,
 *  every block present so an empty one can say so. A `/1` document is one
 *  such workspace; a `/2` document may carry others, which the card ignores. */
export function cardBlocks(doc: Record<string, unknown>): { blocks: CardBlock[]; segments: string[]; confirmed: number } {
  const parsed = parseForgeIdea(doc);
  const workspace = parsed.workspaces.find((w) => w.framework === "business_model") ?? parsed.workspaces[0];
  const canvas = workspace?.canvas ?? [];
  const blocks: CardBlock[] = BLOCKS.map(([key, label]) => ({
    key,
    label,
    entries: canvas
      .filter((e) => e.block === key)
      .map((e) => ({ text: e.text, origin: e.origin, evidence: e.evidence, segment: e.segment })),
  }));
  const segments = [...new Set(canvas.map((e) => e.segment).filter((s): s is string => Boolean(s)))];
  const confirmed = blocks.filter((b) => b.entries.some((e) => e.origin === "confirmed")).length;
  return { blocks, segments, confirmed };
}

export interface ImportOutcome {
  card: ForgeCardRow;
  report: ForgeImportReport;
  embedded: number;
  created: boolean;
}

/** Project the document into the ledger under the owner, keep the document
 *  as the card, and embed what the projection left without a vector. A card
 *  that already exists keeps its visibility; a document for someone else's
 *  idea id is refused. */
export async function importCard(
  db: Db,
  owner: { id: string; email: string },
  input: unknown,
  embed: Embedder,
): Promise<ImportOutcome> {
  const parsed = parseForgeIdea(input);
  const raw = input as { title?: unknown; line?: unknown };
  const [existing] = await db.select().from(forgeCard).where(eq(forgeCard.ideaId, parsed.ideaId)).limit(1);
  if (existing && existing.ownerId !== owner.id) throw new Error("This idea id already belongs to another member.");

  const report = await projectForgeIdea(db, input, { personEmail: owner.email });
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "Untitled idea";
  const line = typeof raw.line === "string" ? raw.line.trim() : "";
  const now = new Date();
  const [card] = await db
    .insert(forgeCard)
    .values({ ideaId: parsed.ideaId, ownerId: owner.id, title, line, doc: input as Record<string, unknown>, updatedAt: now })
    .onConflictDoUpdate({ target: forgeCard.ideaId, set: { title, line, doc: input as Record<string, unknown>, updatedAt: now } })
    .returning();

  const pending = await pendingEmbeds(db, parsed.ideaId);
  const { embedded } = await embedForgeRows(db, pending, embed);
  return { card, report, embedded, created: !existing };
}

export async function ownedCard(db: Db, ownerId: string, ideaId: string): Promise<ForgeCardRow> {
  const [card] = await db
    .select()
    .from(forgeCard)
    .where(and(eq(forgeCard.ideaId, ideaId), eq(forgeCard.ownerId, ownerId)))
    .limit(1);
  if (!card) throw new Error("Card not found.");
  return card;
}

/** `cohort` needs active membership and stamps `published_at` when the card
 *  becomes visible; `private` clears it. Going private is never refused. */
export async function setVisibility(db: Db, ownerId: string, ideaId: string, visibility: ForgeCardVisibility): Promise<ForgeCardRow> {
  const card = await ownedCard(db, ownerId, ideaId);
  if (visibility !== "private" && visibility !== "cohort") throw new Error("Unknown visibility.");
  if (visibility === "cohort") await assertActiveMember(db, ownerId);
  const now = new Date();
  const publishedAt = visibility === "cohort" ? (card.visibility === "cohort" ? card.publishedAt : now) : null;
  const [row] = await db
    .update(forgeCard)
    .set({ visibility, publishedAt, updatedAt: now })
    .where(eq(forgeCard.ideaId, ideaId))
    .returning();
  return row;
}

export async function cardsForOwner(db: Db, ownerId: string): Promise<ForgeCardRow[]> {
  return db.select().from(forgeCard).where(eq(forgeCard.ownerId, ownerId)).orderBy(desc(forgeCard.updatedAt));
}

export interface CohortCard {
  card: ForgeCardRow;
  owner: { id: string; name: string };
}

/** Every card the cohort can see: visibility `cohort`, owner still an active
 *  member. A revoked member's cards fall out of every list without a write. */
export async function cohortCards(db: Db): Promise<CohortCard[]> {
  return db
    .select({ card: forgeCard, owner: { id: person.id, name: person.name } })
    .from(forgeCard)
    .innerJoin(person, eq(person.id, forgeCard.ownerId))
    .innerJoin(
      pilotMembership,
      and(eq(pilotMembership.personId, forgeCard.ownerId), eq(pilotMembership.status, "active"), isNull(pilotMembership.revokedAt)),
    )
    .where(eq(forgeCard.visibility, "cohort"))
    .orderBy(desc(forgeCard.publishedAt));
}

export async function cardById(db: Db, ideaId: string): Promise<CohortCard | null> {
  const [row] = await db
    .select({ card: forgeCard, owner: { id: person.id, name: person.name } })
    .from(forgeCard)
    .innerJoin(person, eq(person.id, forgeCard.ownerId))
    .where(eq(forgeCard.ideaId, ideaId))
    .limit(1);
  return row ?? null;
}

/** The owner always; a cohort card to an active member whose owner is one too.
 *  A caller that already holds the viewer's membership row passes it, and
 *  only the owner's is read. */
export async function canView(db: Db, viewerId: string, card: ForgeCardRow, viewerMembership?: PilotMembership | null): Promise<boolean> {
  if (card.ownerId === viewerId) return true;
  if (card.visibility !== "cohort") return false;
  const viewer = viewerMembership === undefined ? await isActiveMember(db, viewerId) : isActive(viewerMembership);
  return viewer && (await isActiveMember(db, card.ownerId));
}

/** Members, members with any card, and cards the cohort can see. */
export async function cohortCounts(db: Db): Promise<{ members: number; working: number; published: number }> {
  const [m] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(pilotMembership)
    .where(and(eq(pilotMembership.status, "active"), isNull(pilotMembership.revokedAt)));
  const [w] = await db
    .select({ n: sql<number>`count(distinct ${forgeCard.ownerId})::int` })
    .from(forgeCard)
    .innerJoin(
      pilotMembership,
      and(eq(pilotMembership.personId, forgeCard.ownerId), eq(pilotMembership.status, "active"), isNull(pilotMembership.revokedAt)),
    );
  const published = (await cohortCards(db)).length;
  return { members: m?.n ?? 0, working: w?.n ?? 0, published };
}
