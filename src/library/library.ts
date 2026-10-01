import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { cardRevision, type CardRevisionRow } from "@/db/review-schema";
import { componentReference } from "@/db/library-schema";
import { thesisCard } from "@/db/schema";
import { canvasAssertions } from "@/harness/founder/canvas";
import { FACETS } from "@/harness/schema";
import { NOT_STATED } from "@/harness/ledger";
import { ownedIdea } from "@/review/revisions";
import { IndustryGroup } from "@/schema/card";
import { paginate } from "./pagination";
import { pilotMembership } from "@/db/pilot-schema";
import { assertActiveMember, isActiveMember } from "@/pilot/membership";

const Search = z.object({ query: z.string().trim().max(200).default(""), facet: z.enum(FACETS).optional(), industry: IndustryGroup.optional(), page: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(1) });
export type Component = ReturnType<typeof componentsOf>[number];

function componentsOf(revision: CardRevisionRow, slug: string) {
  const fields = revision.fields;
  return canvasAssertions(fields, null).filter((a) => a.subjectType === "idea" && a.text !== NOT_STATED).map((a) => ({
    key: a.field, facet: a.facet, text: a.text, evidenceType: a.evidenceType,
    revisionId: revision.id, version: revision.version, cardId: revision.cardId, slug,
    title: fields.facets?.one_liner ?? fields.offering ?? "Business thesis",
    segment: fields.segment?.description ?? "Customer segment not stated",
    industry: fields.facets?.segment.industry_group ?? null,
  }));
}

export async function listComponents(db: Db, viewerId: string, input: unknown = {}) {
  await assertActiveMember(db, viewerId);
  const search = Search.parse(input);
  // Test latest before visibility, so revocation never resurrects an older publication.
  const rows = await db.select({ revision: cardRevision, slug: thesisCard.slug }).from(cardRevision)
    .innerJoin(thesisCard, eq(cardRevision.cardId, thesisCard.id))
    .innerJoin(pilotMembership, and(
      eq(pilotMembership.personId, cardRevision.ownerId),
      eq(pilotMembership.status, "active"),
      isNull(pilotMembership.revokedAt),
    ))
    .where(and(eq(cardRevision.visibility, "cohort"), isNull(cardRevision.revokedAt), sql`${cardRevision.version} = (select max(newest.version) from card_revision newest where newest.card_id = ${cardRevision.cardId})`))
    .orderBy(desc(cardRevision.createdAt), desc(cardRevision.id));
  const terms = search.query.normalize("NFKC").toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const components = rows.flatMap((row) => componentsOf(row.revision, row.slug)).filter((c) => {
    const context = `${c.text} ${c.title} ${c.segment}`.normalize("NFKC").toLocaleLowerCase();
    return (!search.facet || c.facet === search.facet) && (!search.industry || c.industry === search.industry) && terms.every((term) => context.includes(term));
  });
  return paginate(components, search.page);
}

const Reference = z.object({ cardId: z.uuid(), revisionId: z.uuid(), component: z.string().min(1).max(200), note: z.string().trim().max(2000).default("") }).strict();

export async function saveReference(db: Db, personId: string, input: unknown) {
  const value = Reference.parse(input);
  await assertActiveMember(db, personId);
  await ownedIdea(db, personId, value.cardId);
  const [source] = await db.select({ revision: cardRevision, slug: thesisCard.slug }).from(cardRevision)
    .innerJoin(thesisCard, eq(cardRevision.cardId, thesisCard.id)).where(eq(cardRevision.id, value.revisionId)).limit(1);
  if (!source || source.revision.revokedAt || source.revision.visibility !== "cohort" ||
    !(await isActiveMember(db, source.revision.ownerId)) ||
    !componentsOf(source.revision, source.slug).some((c) => c.key === value.component)) {
    throw new Error("Published component is unavailable.");
  }
  await db.insert(componentReference).values({ ...value, personId }).onConflictDoNothing({ target: [componentReference.cardId, componentReference.revisionId, componentReference.component] });
}

export async function savedReferences(db: Db, personId: string, cardId?: string) {
  if (cardId) await ownedIdea(db, personId, cardId);
  const rows = await db.select({ reference: componentReference, revision: cardRevision, slug: thesisCard.slug }).from(componentReference)
    .innerJoin(cardRevision, eq(componentReference.revisionId, cardRevision.id))
    .innerJoin(thesisCard, eq(cardRevision.cardId, thesisCard.id))
    .where(and(eq(componentReference.personId, personId), cardId ? eq(componentReference.cardId, cardId) : undefined))
    .orderBy(desc(componentReference.createdAt), desc(componentReference.id));
  const ownerIds = [...new Set(rows.map((row) => row.revision.ownerId))];
  const activeOwners = ownerIds.length ? await db.select({ personId: pilotMembership.personId }).from(pilotMembership)
    .where(and(inArray(pilotMembership.personId, ownerIds), eq(pilotMembership.status, "active"), isNull(pilotMembership.revokedAt))) : [];
  const active = new Set(activeOwners.map((row) => row.personId));
  return rows.map((r) => ({
    ...r.reference,
    component: r.revision.revokedAt || r.revision.visibility !== "cohort" || !active.has(r.revision.ownerId)
      ? null
      : componentsOf(r.revision, r.slug).find((c) => c.key === r.reference.component) ?? null,
  }));
}

export async function removeReference(db: Db, personId: string, referenceId: string) {
  z.uuid().parse(referenceId);
  await db.delete(componentReference).where(and(eq(componentReference.id, referenceId), eq(componentReference.personId, personId)));
}
