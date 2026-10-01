import { describe, expect, it, vi } from "vitest";

const migrate = vi.hoisted(() => vi.fn());
const drizzle = vi.hoisted(() => vi.fn(() => ({ runtime: true })));
const postgres = vi.hoisted(() => vi.fn(() => ({ connection: true })));
vi.mock("postgres", () => ({ default: postgres }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle }));
vi.mock("drizzle-orm/postgres-js/migrator", () => ({ migrate }));

import { createPostgresDb } from "./client";

describe("production database startup", () => {
  it("allows concurrent aligned runtime connections without migration writes", async () => {
    await Promise.all([
      createPostgresDb("postgres://runtime:secret@db.example.test/forge", false),
      createPostgresDb("postgres://runtime:secret@db.example.test/forge", false),
    ]);
    expect(postgres).toHaveBeenCalled();
    expect(drizzle).toHaveBeenCalled();
    expect(migrate).not.toHaveBeenCalled();
  });

  it("retains explicit automatic migration for local/test callers", async () => {
    await createPostgresDb("postgres://local:secret@db.example.test/forge", true);
    expect(migrate).toHaveBeenCalledOnce();
  });
});
