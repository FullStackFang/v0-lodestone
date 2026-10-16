import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import RootLayout from "./layout";

const state = vi.hoisted(() => ({ person: null as null | { id: string; name: string; email: string } }));
vi.mock("next/font/google", () => ({ Geist: () => ({ variable: "font-sans" }), Source_Serif_4: () => ({ variable: "font-serif" }) }));
vi.mock("@/lib/session", () => ({ currentVerifiedPerson: async () => state.person }));
vi.mock("@/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/pilot/membership", () => ({ membershipFor: async () => null, isPilotOperatorEmail: () => false }));
vi.mock("./SignOut", () => ({ SignOut: () => <button>Sign out</button> }));
vi.mock("./lodestone/WorkspaceTabs", () => ({ WorkspaceTabs: () => <nav data-tabs /> }));

describe("the chrome", () => {
  it("offers a signed-out visitor sign in and no footer of signed-in links", async () => {
    state.person = null;
    const html = renderToStaticMarkup(await RootLayout({ children: <p>body</p> }));
    expect(html).toContain("Sign in");
    expect(html).not.toContain("<footer");
    expect(html).not.toContain("Create a token");
  });
  it("shows a signed-in person the tabs, their name and the footer", async () => {
    state.person = { id: "p1", name: "Acceptance Walk", email: "you@example.edu" };
    const html = renderToStaticMarkup(await RootLayout({ children: <p>body</p> }));
    expect(html).toContain("data-tabs");
    expect(html).toContain("A. Walk");
    expect(html).toContain("<footer");
  });
});
