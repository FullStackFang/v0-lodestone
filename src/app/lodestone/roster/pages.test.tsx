/** The roster and join pages as functions against the in-memory ledger, with
 *  the session, redirects and mail stubbed: who is turned away, what an
 *  invite sends, and what opening a link does for each kind of visitor. */
import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb, type Db } from "@/db/client";
import { pilotInvitation } from "@/db/pilot-schema";
import { ensurePerson } from "@/harness/ledger";
import { createInvitation, isActiveMember, membershipFor } from "@/pilot/membership";
import { enrollTestMember } from "@/pilot/test-fixtures";

type Who = { id: string; name: string; email: string };
const state = vi.hoisted(() => ({ who: null as Who | null, sent: [] as { email: string; text: string }[] }));
vi.mock("@/lib/session", () => ({
  requirePerson: async () => state.who,
  currentVerifiedPerson: async () => state.who,
}));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/auth/delivery", () => ({ deliverEmail: async (m: { email: string; text: string }) => void state.sent.push(m) }));

const { default: RosterPage } = await import("./page");
const { default: MapPage } = await import("../map/page");
const { invite } = await import("./actions");
const { default: JoinPage } = await import("../join/[token]/page");

let db: Db;
const people: Record<string, Who> = {};
async function person(key: string, email: string, kind?: "operator" | "participant") {
  const id = await ensurePerson(db, { name: key, email });
  if (kind) await enrollTestMember(db, id, kind);
  people[key] = { id, name: key, email };
}
const as = (key: string | null) => { state.who = key ? people[key] : null; };
const html = async (page: Promise<React.ReactElement>) => renderToStaticMarkup(await page);
const join = (token: string) => JoinPage({ params: Promise.resolve({ token }) });
const form = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return f; };

beforeAll(async () => {
  db = await getDb();
  await person("operator", "kind-op@roster.test", "operator");
  await person("member", "member@roster.test", "participant");
  await person("invitee", "invitee@roster.test");
  await person("other", "other@roster.test");
  await person("late", "late@roster.test");
}, 60_000);

afterEach(() => vi.unstubAllEnvs());

describe("/lodestone/roster", () => {
  it("turns a non-operator away with the map's denial", async () => {
    vi.stubEnv("PILOT_OPERATOR_EMAILS", "");
    as("member");
    const roster = await html(RosterPage());
    const map = await html(MapPage());
    expect(roster).toContain("Directors only");
    expect(roster.replace("roster", "cohort map")).toBe(map);
  });

  it("shows a membership-kind operator the roster, and their invite writes one row and one email", async () => {
    vi.stubEnv("PILOT_OPERATOR_EMAILS", "");
    as("operator");
    expect(await html(RosterPage())).toContain("Who is in the cohort");
    state.sent.length = 0;
    const out = await invite({}, form({ email: "new-arrival@roster.test" }));
    expect(out.error).toBeUndefined();
    const rows = await db.select().from(pilotInvitation).where(eq(pilotInvitation.email, "new-arrival@roster.test"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ noticeVersion: "lodestone-pilot-v1", deliveryStatus: "sent", status: "pending" });
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].text).toContain("/lodestone/join/");
    expect(await html(RosterPage())).toContain("new-arrival@roster.test");
  });
});

describe("/lodestone/join/[token]", () => {
  const operatorActor = () => ({ personId: people.operator.id, email: people.operator.email, emailVerified: true });

  it("sends a signed-out visitor to sign in and back", async () => {
    as(null);
    await expect(join("abc")).rejects.toThrow("redirect:/login?next=%2Flodestone%2Fjoin%2Fabc");
  });

  it("enrols the addressee and sends them to their cards", async () => {
    vi.stubEnv("PILOT_OPERATOR_EMAILS", "");
    const { token } = await createInvitation(db, operatorActor(), { email: people.invitee.email, noticeVersion: "lodestone-pilot-v1", expiresAt: new Date(Date.now() + 86_400_000) });
    as("invitee");
    await expect(join(token)).rejects.toThrow("redirect:/lodestone");
    expect(await isActiveMember(db, people.invitee.id)).toBe(true);
    // Opening it again changes nothing and still lands on the cards.
    await expect(join(token)).rejects.toThrow("redirect:/lodestone");
  });

  it("tells someone else the invitation was not theirs, and enrols no one", async () => {
    vi.stubEnv("PILOT_OPERATOR_EMAILS", "");
    const { token } = await createInvitation(db, operatorActor(), { email: "absent@roster.test", noticeVersion: "lodestone-pilot-v1", expiresAt: new Date(Date.now() + 86_400_000) });
    as("other");
    expect(await html(join(token))).toContain("sent to someone else");
    expect(await membershipFor(db, people.other.id)).toBeNull();
  });

  it("tells the addressee an expired link has expired, and who to ask", async () => {
    vi.stubEnv("PILOT_OPERATOR_EMAILS", "");
    const now = new Date();
    const { token } = await createInvitation(db, operatorActor(), { email: people.late.email, noticeVersion: "lodestone-pilot-v1", expiresAt: new Date(now.getTime() - 86_400_000) }, { now: new Date(now.getTime() - 15 * 86_400_000) });
    vi.stubEnv("PILOT_OPERATOR_EMAILS", "director@roster.test");
    as("late");
    const page = await html(join(token));
    expect(page).toContain("has expired");
    expect(page).toContain("director@roster.test");
    expect(await membershipFor(db, people.late.id)).toBeNull();
  });
});
