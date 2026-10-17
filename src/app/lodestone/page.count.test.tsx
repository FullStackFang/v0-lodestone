/** What the home page costs: the same number of statements for a member
 *  with one card as with three, against the same published cohort. */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { COHORT, forgeDocument } from "../../../evals/lodestone/cohort";
import { ensurePerson } from "@/harness/ledger";
import { importCard, setVisibility } from "@/lodestone/cards";
import { countingDb, type CountingDb } from "@/lodestone/test-db";
import { testEmbed } from "@/lodestone/test-embed";
import { enrollTestMember } from "@/pilot/test-fixtures";

const h = vi.hoisted(() => ({ handle: null as null | CountingDb, person: { id: "", name: "", email: "" } }));
vi.mock("@/db/client", async (original) => ({ ...(await original<object>()), getDb: async () => h.handle!.db }));
vi.mock("@/lib/session", async () => {
  const { membershipFor } = await import("@/pilot/membership");
  return { requirePerson: async () => h.person, currentMembership: async () => membershipFor(h.handle!.db, h.person.id) };
});
import LodestonePage from "./page";

const [me, ...others] = COHORT;

beforeAll(async () => {
  h.handle = await countingDb();
  const db = h.handle.db;
  for (const m of COHORT) {
    const id = await ensurePerson(db, { name: m.name, email: m.email });
    await enrollTestMember(db, id);
    if (m === me) h.person = { id, name: m.name, email: m.email };
  }
  for (const m of others) {
    const id = await ensurePerson(db, { name: m.name, email: m.email });
    await importCard(db, { id, email: m.email }, forgeDocument(m), testEmbed);
    await setVisibility(db, id, m.ideaId, "cohort");
  }
  await importCard(db, { id: h.person.id, email: me.email }, forgeDocument(me), testEmbed);
  await setVisibility(db, h.person.id, me.ideaId, "cohort");
}, 120_000);

async function statementsToRender(): Promise<number> {
  const from = h.handle!.statements.length;
  renderToStaticMarkup(await LodestonePage());
  return h.handle!.statements.length - from;
}

describe("home page cost", () => {
  it("does not grow with the cards the member owns", async () => {
    const one = await statementsToRender();
    // Two more of the member's own, one published, one private.
    for (const [at, m] of others.slice(0, 2).entries()) {
      const ideaId = `${at + 1}`.repeat(32);
      await importCard(h.handle!.db, { id: h.person.id, email: me.email }, forgeDocument({ ...m, ideaId, email: me.email }), testEmbed);
      if (at === 0) await setVisibility(h.handle!.db, h.person.id, ideaId, "cohort");
    }
    const three = await statementsToRender();
    expect(three).toBe(one);
    expect(one).toBeLessThanOrEqual(8);
  });
});
