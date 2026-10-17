import { describe, expect, it } from "vitest";
import { seedRefusal } from "./seed-guard";

describe("seedRefusal", () => {
  it("lets the seed run on PGlite and on a local Postgres", () => {
    expect(seedRefusal({})).toBeNull();
    expect(seedRefusal({ DATABASE_URL: "postgres://u:p@localhost:5432/db" })).toBeNull();
    expect(seedRefusal({ DATABASE_URL: "postgres://u:p@127.0.0.1/db", NODE_ENV: "development" })).toBeNull();
  });

  it("refuses a remote host, naming it", () => {
    expect(seedRefusal({ DATABASE_URL: "postgresql://u:p@ep-super-thunder-b7k7iah8.c-13.us-east-1.aws.neon.tech/neondb?sslmode=require" }))
      .toMatch(/ep-super-thunder-b7k7iah8\.c-13\.us-east-1\.aws\.neon\.tech/);
  });

  it("refuses production even with no URL, and a URL it cannot read", () => {
    expect(seedRefusal({ NODE_ENV: "production" })).toMatch(/production/);
    expect(seedRefusal({ DATABASE_URL: "not a url" })).toMatch(/not a URL/);
  });
});
