import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { health, LATEST_MIGRATION } from "@/lodestone/health";
import { GET } from "./route";

const keys = () => {
  vi.stubEnv("VOYAGE_API_KEY", "v-1");
  vi.stubEnv("AUTH_EMAIL_FROM", "Lodestone <hi@lodestone.invalid>");
  vi.stubEnv("RESEND_API_KEY", "re-1");
};

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/lodestone/health", () => {
  it("answers 200 with every field true when migrations are current and both keys are set", async () => {
    keys();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: true, migrations: true, embedder: true, mail: true });
  });

  it("answers 503 naming the missing key, and nothing else", async () => {
    keys();
    vi.stubEnv("RESEND_API_KEY", "");
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, db: true, migrations: true, embedder: true, mail: false });
  });

  it("says migrations are behind when the newest file is not in the migrations table", async () => {
    keys();
    expect(await health(await getDb(), LATEST_MIGRATION + 1)).toEqual({ ok: false, db: true, migrations: false, embedder: true, mail: true });
  });
});
