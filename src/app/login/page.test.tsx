import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Login from "./page";

const state = vi.hoisted(() => ({ signedIn: false }));
vi.mock("@/lib/session", () => ({ ensureSession: async () => state.signedIn ? "verified" : null }));
vi.mock("./SignIn", () => ({ SignIn: ({ callbackURL }: { callbackURL?: string }) => <span data-callback={callbackURL} /> }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

describe("login continuation", () => {
  it("passes the reviewed revision to the sign-in form", async () => {
    state.signedIn = false;
    const page = await Login({ searchParams: Promise.resolve({ next: "/c/reviewed?v=3" }) });
    expect(renderToStaticMarkup(page)).toContain('data-callback="/c/reviewed?v=3"');
  });
  it("returns an already signed-in visitor to the requested local page", async () => {
    state.signedIn = true;
    await expect(Login({ searchParams: Promise.resolve({ next: "/c/reviewed?v=3" }) })).rejects.toThrow("redirect:/c/reviewed?v=3");
  });
  it("sends an unsafe return destination to the default workspace", async () => {
    state.signedIn = false;
    const page = await Login({ searchParams: Promise.resolve({ next: "//outside.example" }) });
    expect(renderToStaticMarkup(page)).toContain('data-callback="/lodestone"');
  });
});
