import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { applyPatch, createCard, createSession, getCard } from "@/db/cards";
import { ensurePerson } from "@/harness/ledger";
import { EXPORT_FORMAT, exportCard } from "./export";

let db: Db;

beforeAll(async () => {
  db = await createPgliteDb();
});

describe("exportCard", () => {
  it("leads with the format stamp and is byte-identical for the same row", async () => {
    const sessionId = await createSession(
      db,
      await ensurePerson(db, { name: "Export", email: "export@example.edu" }),
    );
    const card = await createCard(db, { sessionId, door: "deck", ideaText: "x" });
    const patched = await applyPatch(db, card, { offering: "a thing", facets: null });
    const a = exportCard(patched);
    const b = exportCard((await getCard(db, card.id))!);
    expect(a).toBe(b);
    expect(a.startsWith(`{\n  "format": "${EXPORT_FORMAT}",`)).toBe(true);
    const doc = JSON.parse(a);
    expect(doc.slug).toBe(card.slug);
    expect(doc.stage).toBe("thesis");
    expect(doc.gates.intake).toBe(true);
    expect(doc.provenance.source).toBe("deck");
    expect(doc).not.toHaveProperty("id");
    expect(doc).not.toHaveProperty("session_id");
  });
});
