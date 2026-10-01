import { beforeAll, expect, it, vi } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { createSession } from "@/db/cards";
import { ensurePerson } from "@/harness/ledger";
import { enrollTestMember } from "@/pilot/test-fixtures";
import { listResourcesForPerson } from "@/resources/service";

let db: Db;
let owner: string;
let sessionId: string;
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/db/client", async (original) => ({ ...await original<object>(), getDb: async () => db }));
vi.mock("@/lib/session", () => ({ requireSession: async () => sessionId }));
vi.mock("@/resources/refresh-runs", () => ({ startOwnerRefreshRun: async () => { throw new Error("simulated refresh unavailable"); }, executeRefreshRun: vi.fn() }));
import { startResearch } from "./actions";

beforeAll(async () => {
  db = await createPgliteDb();
  owner = await ensurePerson(db, { name: "Research owner", email: "research-action@fixture.invalid" });
  await enrollTestMember(db, owner);
  sessionId = await createSession(db, owner);
});

it("opens the saved idea with a retry notice when refresh fails, preserving exactly one need", async () => {
  const data = new FormData();
  data.set("idea", "Local friendship group"); data.set("title", "A second conversation"); data.set("criteria", "Meet again within a week");
  await expect(startResearch({}, data)).rejects.toThrow(/redirect:\/resources\?card=.*&refresh=failed/);
  const view = await listResourcesForPerson(db, owner);
  expect(view.needs).toHaveLength(1);
  expect(view.needs[0].title).toBe("A second conversation");
});
