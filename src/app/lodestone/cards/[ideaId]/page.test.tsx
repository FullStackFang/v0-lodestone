/** The card page: nine blocks in grid order, prior art split at the
 *  neighbour line, the link to the field, and a long title left unbroken. */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { COHORT, forgeDocument } from "../../../../../evals/lodestone/cohort";
import { getDb } from "@/db/client";
import { ensurePerson } from "@/harness/ledger";
import { BLOCKS, importCard } from "@/lodestone/cards";
import { testEmbed } from "@/lodestone/test-embed";
import { enrollTestMember } from "@/pilot/test-fixtures";

const sam = COHORT[0];
const LONG_ID = "f".repeat(32);
const LONG_TITLE = "x".repeat(120);
const who = vi.hoisted(() => ({ person: { id: "", name: "", email: "" } }));
// The memo needs a request; the row itself is read as the page would.
vi.mock("@/lib/session", async () => {
  const { getDb } = await import("@/db/client");
  const { membershipFor } = await import("@/pilot/membership");
  return { requirePerson: async () => who.person, currentMembership: async () => membershipFor(await getDb(), who.person.id) };
});
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); } }));
import CardPage from "./page";

const render = async (ideaId: string) => renderToStaticMarkup(await CardPage({ params: Promise.resolve({ ideaId }) }));

beforeAll(async () => {
  const db = await getDb();
  const id = await ensurePerson(db, { name: sam.name, email: sam.email });
  await enrollTestMember(db, id);
  await importCard(db, { id, email: sam.email }, forgeDocument(sam), testEmbed);
  await importCard(db, { id, email: sam.email }, { ...forgeDocument(sam), id: LONG_ID, title: LONG_TITLE }, testEmbed);
  who.person = { id, name: sam.name, email: sam.email };
}, 60_000);

describe("card page", () => {
  it("lays the nine blocks out in order, splits prior art at the line, and links to the field", async () => {
    const html = await render(sam.ideaId);
    let at = 0;
    for (const [, label] of BLOCKS) {
      const block = html.indexOf('class="block', at);
      expect(block).toBeGreaterThan(-1);
      const next = html.indexOf(label, block);
      expect(next).toBeGreaterThan(block);
      at = next;
    }
    expect(html).toContain("Within reach");
    expect(html).toContain(`href="/lodestone/cards/${sam.ideaId}/field"`);
  });
  it("keeps a 120-character title whole in the masthead", async () => {
    const html = await render(LONG_ID);
    const h1 = html.indexOf("<h1");
    expect(h1).toBeGreaterThan(-1);
    expect(html.slice(h1, html.indexOf("</h1>", h1))).toContain(LONG_TITLE);
  });
});
