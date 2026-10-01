import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getDb, type Db } from "@/db/client";
import { createCard, createSession } from "@/db/cards";
import { ensurePerson } from "@/harness/ledger";
import { publishRevision, revokeRevision, saveIdea } from "./revisions";
import CardPage from "@/app/c/[slug]/page";
import { enrollTestMember } from "@/pilot/test-fixtures";

const visitor = vi.hoisted(() => ({ personId: null as string | null }));
vi.mock("@/lib/session", () => ({ ensureSession: async () => visitor.personId ? "verified" : null, currentPerson: async () => visitor.personId ? { id: visitor.personId } : null }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); }, redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
let db: Db;
let owner: string;
beforeAll(async () => {
  db = await getDb();
  owner = await ensurePerson(db, { name: "Publisher", email: "publication-navigation@example.edu" });
  await enrollTestMember(db, owner);
});
async function idea() {
  const card = await createCard(db, { sessionId: await createSession(db, owner), door: "blank" });
  await saveIdea(db, owner, card.id, { offering: "A shared thesis" });
  return card;
}
const page = (slug: string, version: number) => CardPage({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({ v: String(version) }) });

describe("publication sign-in continuation", () => {
  it("sends a first-time cohort recipient to sign in and preserves the requested revision", async () => {
    visitor.personId = null;
    const card = await idea();
    const revision = await publishRevision(db, owner, card.id, "cohort");
    await expect(page(card.slug, revision.version)).rejects.toThrow(`redirect:/login?next=${encodeURIComponent(`/c/${card.slug}?v=${revision.version}`)}`);
    visitor.personId = owner;
    expect(renderToStaticMarkup(await page(card.slug, revision.version))).toContain("A shared thesis");
  });

  it("gives anonymous unknown and revoked links the same continuation without leaking content", async () => {
    visitor.personId = null;
    const card = await idea();
    const revision = await publishRevision(db, owner, card.id, "unlisted");
    await revokeRevision(db, owner, revision.id);
    for (const slug of [card.slug, "unknown-publication"]) {
      await expect(page(slug, 1)).rejects.toThrow(`redirect:/login?next=${encodeURIComponent(`/c/${slug}?v=1`)}`);
    }
    visitor.personId = owner;
    await expect(page(card.slug, 1)).rejects.toThrow("not found");
  });

  it("still allows an anonymous reader to open an unlisted revision", async () => {
    visitor.personId = null;
    const card = await idea();
    const revision = await publishRevision(db, owner, card.id, "unlisted");
    expect(renderToStaticMarkup(await page(card.slug, revision.version))).toContain("A shared thesis");
  });
});
