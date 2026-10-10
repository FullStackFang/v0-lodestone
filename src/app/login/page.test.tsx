import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Login from "./page";

const state = vi.hoisted(() => ({ signedIn: false }));
vi.mock("@/lib/session", () => ({ ensureSession: async () => state.signedIn ? "verified" : null }));
vi.mock("./SignIn", () => ({ SignIn: ({ callbackURL, google, email }: { callbackURL?: string; google?: boolean; email?: boolean }) => <span data-callback={callbackURL} data-google={String(google)} data-email={String(email)} /> }));
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
  it("offers Google when a client is configured and email when a provider or the dev outbox exists", async () => {
    state.signedIn = false;
    vi.stubEnv("GOOGLE_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    vi.stubEnv("AUTH_EMAIL_FROM", "");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    try {
      const html = renderToStaticMarkup(await Login({ searchParams: Promise.resolve({}) }));
      expect(html).toContain('data-google="true"');
      expect(html).toContain('data-email="false"');
    } finally { vi.unstubAllEnvs(); }
  });
  it("sends an unsafe return destination to the default workspace", async () => {
    state.signedIn = false;
    const page = await Login({ searchParams: Promise.resolve({ next: "//outside.example" }) });
    expect(renderToStaticMarkup(page)).toContain('data-callback="/lodestone"');
  });
});
