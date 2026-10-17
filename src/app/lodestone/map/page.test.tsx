/** The map is the operator's view: a non-operator gets the refusal and no
 *  figures; an operator gets the five figures and the numbered regions. */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { ensurePerson } from "@/harness/ledger";
import { enrollTestMember } from "@/pilot/test-fixtures";

const who = vi.hoisted(() => ({ person: { id: "", name: "", email: "" } }));
// The memo needs a request; the row itself is read as the page would.
vi.mock("@/lib/session", async () => {
  const { getDb } = await import("@/db/client");
  const { membershipFor } = await import("@/pilot/membership");
  return { requirePerson: async () => who.person, currentMembership: async () => membershipFor(await getDb(), who.person.id) };
});
import MapPage from "./page";

const member = { name: "Plain Member", email: "member@map.test" };
const director = { name: "The Director", email: "director@map.test" };

beforeAll(async () => {
  const db = await getDb();
  for (const p of [member, director]) await enrollTestMember(db, await ensurePerson(db, p));
}, 60_000);
afterEach(() => vi.unstubAllEnvs());

describe("map page", () => {
  it("refuses a non-operator without showing a figure", async () => {
    const db = await getDb();
    who.person = { id: await ensurePerson(db, member), ...member };
    const html = renderToStaticMarkup(await MapPage());
    expect(html).toContain("Directors only");
    expect(html).not.toContain('class="fig"');
  });
  it("shows an operator the five figures and the first numbered section", async () => {
    vi.stubEnv("PILOT_OPERATOR_EMAILS", director.email);
    const db = await getDb();
    who.person = { id: await ensurePerson(db, director), ...director };
    const html = renderToStaticMarkup(await MapPage());
    expect(html.match(/class="fig"/g)?.length).toBe(5);
    expect(html).toMatch(/class="num"[^>]*>01</);
  });
});
