/** The home page renders the signed-in member's cards as tiles under the
 *  numbered sections, with the import form in the "next card" tile. */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { COHORT, forgeDocument } from "../../../evals/lodestone/cohort";
import { getDb } from "@/db/client";
import { ensurePerson } from "@/harness/ledger";
import { importCard } from "@/lodestone/cards";
import { testEmbed } from "@/lodestone/test-embed";
import { enrollTestMember } from "@/pilot/test-fixtures";

const sam = COHORT[0];
const who = vi.hoisted(() => ({ person: { id: "", name: "", email: "" } }));
vi.mock("@/lib/session", () => ({ requirePerson: async () => who.person }));
import LodestonePage from "./page";

beforeAll(async () => {
  const db = await getDb();
  const id = await ensurePerson(db, { name: sam.name, email: sam.email });
  await enrollTestMember(db, id);
  await importCard(db, { id, email: sam.email }, forgeDocument(sam), testEmbed);
  who.person = { id, name: sam.name, email: sam.email };
}, 60_000);

describe("home", () => {
  it("renders the numbered sections, the member's card as a tile, and the import form", async () => {
    const html = renderToStaticMarkup(await LodestonePage());
    expect(html).toMatch(/class="num"[^>]*>01</);
    const tile = html.indexOf('class="tile"');
    expect(tile).toBeGreaterThan(-1);
    expect(html.slice(tile, tile + 2000)).toContain(sam.title);
    expect(html).toContain("Where your idea sits in the field.");
    expect(html).toContain('<input type="file"');
  });
});
