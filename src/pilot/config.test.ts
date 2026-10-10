import { afterEach, describe, expect, it, vi } from "vitest";
import { productionConfig } from "./config";

afterEach(() => vi.unstubAllEnvs());

const complete = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://runtime:secret@db.example.test/forge?sslmode=require",
  BETTER_AUTH_URL: "https://pilot.example.test",
  BETTER_AUTH_SECRET: "a-production-secret-with-at-least-32-characters",
  AUTH_EMAIL_FROM: "Lodestone <pilot@example.test>",
  RESEND_API_KEY: "re_secret_value",
  PILOT_OPERATOR_EMAILS: "operator@example.test",
};

describe("production configuration", () => {
  it("requires persistent Postgres and cannot fall back to PGlite", () => {
    expect(() => productionConfig({ ...complete, DATABASE_URL: "" })).toThrow(/DATABASE_URL/);
    expect(() => productionConfig({ ...complete, DATABASE_URL: "file:local" })).toThrow(/Postgres/);
  });

  it("requires a stable HTTPS origin, strong auth secret, delivery, and operators", () => {
    expect(() => productionConfig({ ...complete, BETTER_AUTH_URL: "http://pilot.example.test" })).toThrow(/HTTPS/);
    expect(() => productionConfig({ ...complete, BETTER_AUTH_SECRET: "short" })).toThrow(/32/);
    expect(() => productionConfig({ ...complete, RESEND_API_KEY: "" })).toThrow(/delivery/);
    expect(() => productionConfig({ ...complete, PILOT_OPERATOR_EMAILS: "" })).toThrow(/operator/i);
  });

  it("returns normalized configuration without weakening checks for a development shell", () => {
    const config = productionConfig({ ...complete, NODE_ENV: "development", PILOT_OPERATOR_EMAILS: " OPERATOR@EXAMPLE.TEST " });
    expect(config.authOrigin).toBe("https://pilot.example.test");
    expect(config.operatorEmails).toEqual(["operator@example.test"]);
  });
});
