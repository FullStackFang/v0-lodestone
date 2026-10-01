import { beforeEach, describe, expect, it, vi } from "vitest";

const record = vi.hoisted(() => vi.fn());
const person = vi.hoisted(() => ({ current: { id: "00000000-0000-4000-8000-000000000001" } as { id: string } | null }));
vi.mock("@/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/lib/session", () => ({ currentVerifiedPerson: async () => person.current }));
vi.mock("@/pilot/measurement", () => ({ recordPilotActivity: record }));
import { POST } from "./route";

const request = (body = "{}", origin = "https://pilot.example.test") => new Request("https://pilot.example.test/api/pilot/activity", {
  method: "POST", headers: { origin, "content-type": "application/json" }, body,
});

beforeEach(() => { record.mockReset(); record.mockResolvedValue(true); person.current = { id: "00000000-0000-4000-8000-000000000001" }; });

describe("daily activity endpoint", () => {
  it("accepts only an authenticated same-origin content-free beacon", async () => {
    expect((await POST(request())).status).toBe(204);
    expect(record).toHaveBeenCalledWith({}, person.current!.id);
    expect((await POST(request('{"personId":"other"}'))).status).toBe(400);
    expect((await POST(request("{}", "https://attacker.example"))).status).toBe(403);
    expect(record).toHaveBeenCalledTimes(1);
  });

  it("rejects an unauthenticated beacon", async () => {
    person.current = null;
    expect((await POST(request())).status).toBe(401);
    expect(record).not.toHaveBeenCalled();
  });
});
