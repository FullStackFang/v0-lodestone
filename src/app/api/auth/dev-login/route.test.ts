import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/auth/server", async () => {
  const { deliverAuthLink } = await vi.importActual<typeof import("@/auth/delivery")>("@/auth/delivery");
  return {
    getAuth: async () => ({
      api: {
        signInMagicLink: async ({ body }: { body: { email: string; callbackURL: string } }) => {
          await deliverAuthLink({ email: body.email, url: `http://localhost:3010/api/auth/magic-link/verify?token=t-${body.email}&callbackURL=${encodeURIComponent(body.callbackURL)}` });
        },
      },
    }),
  };
});

describe("the development sign-in bypass", () => {
  beforeAll(async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lodestone-dev-login-"));
    vi.spyOn(process, "cwd").mockReturnValue(dir);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("requests a link for the address and follows it to the chosen page", async () => {
    const response = await GET(new Request("http://localhost:3010/api/auth/dev-login?email=You@Example.edu&next=/lodestone/map"));
    expect(response.status).toBeGreaterThanOrEqual(302);
    expect(response.status).toBeLessThan(400);
    const location = response.headers.get("location")!;
    expect(location).toContain("/api/auth/magic-link/verify?token=t-you@example.edu");
    expect(location).toContain("callbackURL=%2Flodestone%2Fmap");
  });
  it("needs an address", async () => {
    const response = await GET(new Request("http://localhost:3010/api/auth/dev-login"));
    expect(response.status).toBe(400);
  });
  it("does not exist in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await GET(new Request("http://localhost:3010/api/auth/dev-login?email=you@example.edu"));
    expect(response.status).toBe(404);
  });
  it("does not exist once real mail is configured", async () => {
    vi.stubEnv("AUTH_EMAIL_FROM", "lodestone@example.edu");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const response = await GET(new Request("http://localhost:3010/api/auth/dev-login?email=you@example.edu"));
    expect(response.status).toBe(404);
  });
});
