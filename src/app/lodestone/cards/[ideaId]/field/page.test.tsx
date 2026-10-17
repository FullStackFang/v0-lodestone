/** The field view: a stage, the same nodes as a ranked list, the line named,
 *  and honest empty states for a card without vectors and a non-member. */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { COHORT, CORPUS, forgeDocument } from "../../../../../../evals/lodestone/cohort";
import { getDb } from "@/db/client";
import { document } from "@/db/schema";
import { putArtifactText } from "@/harness/canonical";
import { ensurePerson } from "@/harness/ledger";
import { importCard, setVisibility } from "@/lodestone/cards";
import { fieldFor } from "@/lodestone/field";
import { embedPaperAbstracts } from "@/lodestone/priorArt";
import { testEmbed } from "@/lodestone/test-embed";
import { enrollTestMember } from "@/pilot/test-fixtures";

const [sam, priya] = COHORT;
const stranger = { name: "Not A Member", email: "outsider@cohort.test" };
const BARE_ID = "d".repeat(32);
const OUTSIDE_ID = "e".repeat(32);
const LONG_ID = "f".repeat(32);
const LONG_TITLE = "x".repeat(120);
const people = new Map<string, string>();
const who = vi.hoisted(() => ({ person: { id: "", name: "", email: "" } }));
// The memo needs a request; the row itself is read as the page would.
vi.mock("@/lib/session", async () => {
  const { getDb } = await import("@/db/client");
  const { membershipFor } = await import("@/pilot/membership");
  return { requirePerson: async () => who.person, currentMembership: async () => membershipFor(await getDb(), who.person.id) };
});
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); }, useRouter: () => ({ push: () => {} }) }));
import FieldPage from "./page";

const as = (email: string, name: string) => { who.person = { id: people.get(email)!, name, email }; };
const render = async (ideaId: string) => renderToStaticMarkup(await FieldPage({ params: Promise.resolve({ ideaId }) }));
const noEmbed = async (texts: string[]) => ({ vectors: texts.map(() => null), embedded: false, model: null, tokens: null });

beforeAll(async () => {
  const db = await getDb();
  for (const m of [sam, priya]) {
    const id = await ensurePerson(db, { name: m.name, email: m.email });
    people.set(m.email, id);
    await enrollTestMember(db, id);
  }
  people.set(stranger.email, await ensurePerson(db, stranger));
  for (const p of CORPUS) {
    const [row] = await db.insert(document).values({ sessionId: null, source: "paper", title: p.title, text: null }).returning();
    await putArtifactText(db, { artifactId: row.id, sourceFormat: "abstract", parser: "test", text: p.abstract, provenance: {} });
  }
  await embedPaperAbstracts(db, testEmbed);
  const owner = (email: string) => ({ id: people.get(email)!, email });
  await importCard(db, owner(sam.email), forgeDocument(sam), testEmbed);
  await importCard(db, owner(priya.email), forgeDocument(priya), testEmbed);
  await setVisibility(db, people.get(priya.email)!, priya.ideaId, "cohort");
  await importCard(db, owner(sam.email), { ...forgeDocument(sam), id: LONG_ID, title: LONG_TITLE }, testEmbed);
  await importCard(db, owner(sam.email), { ...forgeDocument(sam), id: BARE_ID, title: "A card without vectors" }, noEmbed);
  await importCard(db, owner(stranger.email), { ...forgeDocument(sam), id: OUTSIDE_ID, title: "An outsider's card" }, testEmbed);
}, 60_000);

describe("field page", () => {
  it("draws the stage and lists every node with the line named", async () => {
    as(sam.email, sam.name);
    const db = await getDb();
    const field = (await fieldFor(db, people.get(sam.email)!, sam.ideaId))!;
    expect(field.nodes.length).toBeGreaterThan(0);
    const html = await render(sam.ideaId);
    expect(html).toContain('class="stage"');
    expect(html).toContain(field.line.toFixed(2));
    for (const n of field.nodes) {
      const at = html.indexOf(n.title, html.indexOf("The same field, as a list"));
      expect(at).toBeGreaterThan(-1);
      expect(html.lastIndexOf('class="rk', at)).toBeGreaterThan(-1);
    }
    expect(html).toContain(priya.title);
  });
  it("says so when the card has no vectors", async () => {
    as(sam.email, sam.name);
    expect(await render(BARE_ID)).toContain("no vectors yet");
  });
  it("shows a non-member prior art and the membership sentence, with no peer row", async () => {
    as(stranger.email, stranger.name);
    const html = await render(OUTSIDE_ID);
    expect(html).toContain("Peers appear for active members");
    expect(html).not.toContain("· peer card");
  });
  it("keeps a 120-character title whole in the heading", async () => {
    as(sam.email, sam.name);
    const html = await render(LONG_ID);
    expect(html).toContain(LONG_TITLE);
  });
});
