import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { ensurePerson } from "@/harness/ledger";
import { createCard, createSession } from "@/db/cards";
import { createAuth } from "./server";
import { verifiedContext } from "./identity";
import { safeReturnPath } from "./return-path";

let db: Db;
const messages: { email: string; url: string }[] = [];
let auth: ReturnType<typeof createAuth>;
const origin = "http://localhost:3000";
const request = (route: string, body?: object, cookie?: string) => new Request(`${origin}/api/auth${route}`, {
  method: body ? "POST" : "GET",
  headers: { origin, ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

beforeAll(async () => {
  db = await createPgliteDb();
  auth = createAuth(db, {
    baseURL: origin,
    secret: "test-only-auth-secret-at-least-thirty-two-characters",
    sendMagicLink: async (message) => { messages.push(message); },
  });
});

describe("verified founder access", () => {
  it("returns a newly verified reviewer to the requested revision", async () => {
    const callbackURL = safeReturnPath("/c/reviewed?v=3#reviews");
    const sent = await auth.handler(request("/sign-in/magic-link", { email: "reviewer-return@example.edu", name: "Reviewer", callbackURL }));
    expect(sent.ok).toBe(true);
    const verified = await auth.handler(new Request(messages.at(-1)!.url));
    expect(verified.status).toBe(302);
    expect(new URL(verified.headers.get("location")!, origin).href).toBe(`${origin}${callbackURL}`);
  });

  it("does not authorize an existing email until its link is consumed", async () => {
    const personId = await ensurePerson(db, { name: "Owner", email: "owner@example.edu" });
    const legacySessionId = await createSession(db, personId);
    await createCard(db, { sessionId: legacySessionId, door: "blank" });
    const sent = await auth.handler(request("/sign-in/magic-link", { email: "owner@example.edu", name: "Impostor", callbackURL: "/ideas" }));
    expect(sent.ok).toBe(true);
    expect(await verifiedContext(db, null)).toBeNull();
    expect(await auth.api.getSession({ headers: new Headers() })).toBeNull();
    expect(await auth.api.getSession({ headers: new Headers({ cookie: `tf_session=${legacySessionId}` }) })).toBeNull();

    const verified = await auth.handler(new Request(messages.at(-1)!.url));
    expect(verified.status).toBe(302);
    const cookie = verified.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.emailVerified).toBe(true);
    const context = await verifiedContext(db, session);
    expect(context?.person.id).toBe(personId);
    expect(context?.person.name).toBe("Owner");

    const replay = await auth.handler(new Request(messages.at(-1)!.url));
    expect(replay.headers.get("location")).toContain("error=");
    expect(replay.headers.getSetCookie().filter((c) => c.includes("session_token="))).toHaveLength(0);

    const signout = await auth.handler(request("/sign-out", {}, cookie));
    expect(signout.ok).toBe(true);
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
  });

  it("ignores an unverified user and binds separate verified sessions to the same founder", async () => {
    const user = { id: "verified-test-user", name: "Returning", email: "returning@example.edu", emailVerified: false };
    expect(await verifiedContext(db, { user, session: { id: "unverified" } })).toBeNull();
    const one = await verifiedContext(db, { user: { ...user, emailVerified: true }, session: { id: "first-auth-session" } });
    const two = await verifiedContext(db, { user: { ...user, emailVerified: true }, session: { id: "second-auth-session" } });
    expect(one?.person.id).toBe(two?.person.id);
    expect(one?.sessionId).not.toBe(two?.sessionId);
  });
});
