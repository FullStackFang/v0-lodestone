import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./return-path";

describe("sign-in return path", () => {
  it.each(["/c/abc123?v=2#reviews", "/ideas", "/library?q=dental", "/resources?card=idea-id"])("keeps a local destination: %s", (path) => {
    expect(safeReturnPath(path)).toBe(path);
  });

  it.each([undefined, null, ["/c/one"], "", "https://outside.example", "//outside.example", "/\\outside.example", "\\outside.example", "/%5coutside.example", "/%255coutside.example", "/%2foutside.example", "/safe/..//outside.example", "/\t/outside.example", "/%00bad", "/bad%encoding"])("rejects unsafe or malformed input: %s", (path) => {
    expect(safeReturnPath(path)).toBe("/ideas");
  });
});
