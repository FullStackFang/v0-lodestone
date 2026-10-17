/** `/` is a config redirect: Next answers it before routing, so no layout
 *  renders and no session is read. The statement count for `/` in
 *  `npm run lodestone:measure` is the runtime half of this. */
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("the root", () => {
  it("redirects to the network with a temporary 307, from config", async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects).toContainEqual({ source: "/", destination: "/lodestone", permanent: false });
  });

  it("has no page to render", () => {
    expect(existsSync(path.join(import.meta.dirname, "page.tsx"))).toBe(false);
  });
});
