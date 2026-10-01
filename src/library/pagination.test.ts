import { describe, expect, it } from "vitest";
import { pageNumber, paginate } from "./pagination";

describe("library pagination", () => {
  it("keeps pages beyond one thousand reachable with bounded output", () => {
    const items = Array.from({ length: 24_001 }, (_, index) => index);
    expect(paginate(items, pageNumber("1001"))).toEqual({ items: [24_000], total: 24_001, page: 1001, pages: 1001 });
    expect(paginate(items, 1000).items).toHaveLength(24);
  });

  it("clamps stale saved-reference pages to the new last page", () => {
    expect(paginate(["last reference"], 2)).toEqual({ items: ["last reference"], total: 1, page: 1, pages: 1 });
    expect(paginate([], 1001)).toEqual({ items: [], total: 0, page: 1, pages: 1 });
  });

  it.each([undefined, ["2"], "0", "-1", "1.5", "Infinity", "9007199254740992", "invalid"])("defaults malformed page input to page one: %s", (value) => {
    expect(pageNumber(value)).toBe(1);
  });
});
