/** The network as a client sees it: bearer tokens a member mints for their
 *  own Whetstone, the person a token stands for, and the feedback a client
 *  sends back about a match. Everything the routes under `/api/lodestone`
 *  do is here, so a test can exercise the rules without a server.
 *
 *  The token is `lst_` and 32 random bytes in hex. It is returned once from
 *  `mintToken` and never stored; the row keeps its sha256. A revoked token
 *  resolves to nobody, so a client that kept a cut token fails closed. */
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  apiToken,
  cardFeedback,
  type ApiTokenRow,
  type CardFeedbackKind,
  type CardFeedbackRow,
  type CardFeedbackVerdict,
} from "@/db/lodestone-schema";
import { person } from "@/db/schema";
import { cardBlocks, ownedCard } from "./cards";

export const TOKEN_PREFIX = "lst_";
export const FEEDBACK_KINDS: readonly CardFeedbackKind[] = ["paper", "peer"];
export const FEEDBACK_VERDICTS: readonly CardFeedbackVerdict[] = ["useful", "known", "not_relevant"];

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export interface MintedToken {
  row: ApiTokenRow;
  /** The only time the plaintext exists outside the client. */
  token: string;
}

export async function mintToken(db: Db, personId: string, label: string): Promise<MintedToken> {
  const name = label.trim();
  if (!name) throw new Error("Give the token a label so you can tell them apart later.");
  if (name.length > 60) throw new Error("Keep the label under sixty characters.");
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("hex")}`;
  const [row] = await db.insert(apiToken).values({ personId, tokenHash: hashToken(token), label: name }).returning();
  return { row, token };
}

export async function listTokens(db: Db, personId: string): Promise<ApiTokenRow[]> {
  return db.select().from(apiToken).where(eq(apiToken.personId, personId)).orderBy(desc(apiToken.createdAt));
}

/** Revoking is the owner's alone; someone else's id is "not found". */
export async function revokeToken(db: Db, personId: string, tokenId: string, now = new Date()): Promise<ApiTokenRow> {
  const [row] = await db
    .update(apiToken)
    .set({ revokedAt: now })
    .where(and(eq(apiToken.id, tokenId), eq(apiToken.personId, personId), isNull(apiToken.revokedAt)))
    .returning();
  if (!row) throw new Error("Token not found.");
  return row;
}

export interface TokenPerson {
  id: string;
  name: string;
  email: string;
  tokenId: string;
}

/** How stale `last_used_at` may get before a call stamps it again. The tokens
 *  page shows it to the day; a write on every API call buys nothing. */
const STAMP_EVERY_MS = 5 * 60 * 1000;

/** The member behind a live token, or null. Stamps `last_used_at`, at most
 *  once per `STAMP_EVERY_MS`. */
export async function personForToken(db: Db, token: string, now = new Date()): Promise<TokenPerson | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const [row] = await db
    .select({ tokenId: apiToken.id, lastUsedAt: apiToken.lastUsedAt, id: person.id, name: person.name, email: person.email })
    .from(apiToken)
    .innerJoin(person, eq(person.id, apiToken.personId))
    .where(and(eq(apiToken.tokenHash, hashToken(token)), isNull(apiToken.revokedAt)))
    .limit(1);
  if (!row) return null;
  const { lastUsedAt, ...who } = row;
  if (!lastUsedAt || now.getTime() - lastUsedAt.getTime() >= STAMP_EVERY_MS) {
    await db.update(apiToken).set({ lastUsedAt: now }).where(eq(apiToken.id, who.tokenId));
  }
  return who;
}

/** `Authorization: Bearer lst_...` on a request, resolved. Anything else is null. */
export async function personFromRequest(db: Db, request: Request): Promise<TokenPerson | null> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? personForToken(db, match[1]) : null;
}

export interface FeedbackInput {
  ideaId: string;
  kind: CardFeedbackKind;
  targetId: string;
  verdict: CardFeedbackVerdict;
  /** The score and blocks the client showed, kept for the retune. */
  context?: Record<string, unknown>;
}

/** Record what a card's owner thought of one match. Only the owner may
 *  speak for a card; a second verdict on the same target replaces the first. */
export async function recordFeedback(db: Db, personId: string, input: FeedbackInput, now = new Date()): Promise<CardFeedbackRow> {
  if (!FEEDBACK_KINDS.includes(input.kind)) throw new Error("Unknown feedback kind.");
  if (!FEEDBACK_VERDICTS.includes(input.verdict)) throw new Error("Unknown verdict.");
  if (!input.targetId.trim()) throw new Error("Feedback needs a target.");
  await ownedCard(db, personId, input.ideaId);
  const [row] = await db
    .insert(cardFeedback)
    .values({ personId, ideaId: input.ideaId, kind: input.kind, targetId: input.targetId, verdict: input.verdict, context: input.context ?? {}, updatedAt: now })
    .onConflictDoUpdate({
      target: [cardFeedback.personId, cardFeedback.ideaId, cardFeedback.kind, cardFeedback.targetId],
      set: { verdict: input.verdict, context: input.context ?? {}, updatedAt: now },
    })
    .returning();
  return row;
}

export async function feedbackFor(db: Db, personId: string, ideaId: string): Promise<CardFeedbackRow[]> {
  return db.select().from(cardFeedback).where(and(eq(cardFeedback.personId, personId), eq(cardFeedback.ideaId, ideaId)));
}

/** How the cohort judged a paper or peer, for the map and the retune. */
export async function feedbackCounts(db: Db, kind: CardFeedbackKind, targetId: string): Promise<Record<CardFeedbackVerdict, number>> {
  const rows = await db
    .select({ verdict: cardFeedback.verdict, n: sql<number>`count(*)::int` })
    .from(cardFeedback)
    .where(and(eq(cardFeedback.kind, kind), eq(cardFeedback.targetId, targetId)))
    .groupBy(cardFeedback.verdict);
  const out: Record<CardFeedbackVerdict, number> = { useful: 0, known: 0, not_relevant: 0 };
  for (const r of rows) out[r.verdict] = r.n;
  return out;
}

/** A card as the client lists it: identity, state, and how much of it is
 *  in the author's own words. Never the document itself. */
export function cardSummary(card: { ideaId: string; title: string; line: string; visibility: string; publishedAt: Date | null; updatedAt: Date; doc: Record<string, unknown> }) {
  return {
    ideaId: card.ideaId,
    title: card.title,
    line: card.line,
    visibility: card.visibility,
    publishedAt: card.publishedAt,
    updatedAt: card.updatedAt,
    confirmed: cardBlocks(card.doc).confirmed,
  };
}
