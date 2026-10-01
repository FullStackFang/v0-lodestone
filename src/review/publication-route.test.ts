import { beforeAll, describe, expect, it, vi } from "vitest";
import { getDb, type Db } from "@/db/client";
import { applyPatch, createCard, createSession } from "@/db/cards";
import { ensurePerson } from "@/harness/ledger";
import { GET } from "@/app/c/[slug]/json/route";
import { publishRevision, revokeRevision } from "./revisions";
import { enrollTestMember } from "@/pilot/test-fixtures";

const viewer = vi.hoisted(() => ({ id: null as string | null }));
vi.mock("@/lib/session", () => ({
  ensureSession: async () => viewer.id ? "verified-session" : null,
  currentPerson: async () => viewer.id ? { id: viewer.id } : null,
}));

let db: Db;
let ownerId: string;
let peerId: string;
let sessionId: string;

beforeAll(async () => {
  db = await getDb();
  ownerId = await ensurePerson(db, { name: "Publication author", email: "publication-author@example.edu" });
  peerId = await ensurePerson(db, { name: "Publication peer", email: "publication-peer@example.edu" });
  await enrollTestMember(db, ownerId);
  await enrollTestMember(db, peerId);
  sessionId = await createSession(db, ownerId);
});

function read(slug: string, query = "") {
  return GET(new Request(`http://localhost/c/${slug}/json${query}`), { params: Promise.resolve({ slug }) });
}

describe("publication JSON access", () => {
  it("never exposes an unpublished draft and enforces cohort access and revocation", async () => {
    const card = await createCard(db, { sessionId, door: "blank", ideaText: "private initial thought" });
    await applyPatch(db, card, { offering: "A cancellation waitlist" });
    viewer.id = null;
    expect((await read(card.slug)).status).toBe(404);
    const revision = await publishRevision(db, ownerId, card.id, "cohort");
    expect((await read(card.slug)).status).toBe(404);
    viewer.id = peerId;
    expect((await read(card.slug)).status).toBe(200);
    expect((await read(card.slug, "?v=bogus")).status).toBe(404);
    await revokeRevision(db, ownerId, revision.id);
    expect((await read(card.slug)).status).toBe(404);
  });

  it("exports only the fixed published revision and no raw source or internal ownership identifiers", async () => {
    const card = await createCard(db, { sessionId, door: "resume", ideaText: "PRIVATE RESUME EMAIL" });
    await applyPatch(db, card, { offering: "Original product", founder_context: { background: "PRIVATE BACKGROUND", unfair_advantages: [] } });
    const revision = await publishRevision(db, ownerId, card.id, "unlisted");
    await applyPatch(db, card, { offering: "New private draft" });
    viewer.id = null;
    const response = await read(card.slug, `?v=${revision.version}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.text();
    expect(body).toContain('"format": "thesis-revision/1"');
    expect(body).toContain("Original product");
    expect(body).not.toContain("PRIVATE");
    expect(body).not.toContain("New private draft");
    expect(body).not.toContain(ownerId);
    expect(body).not.toContain(card.id);
    expect(body).not.toContain("doc_id");
  });
});
