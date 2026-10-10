import { describe, expect, it } from "vitest";
import { COHORT, CORPUS, forgeDocument } from "../../evals/lodestone/cohort";
import { FIRMS, FIRM_CORPUS } from "../../evals/lodestone/firms";
import { BLOCKS, cardBlocks } from "./cards";

/** Both seed sets must be cards the import accepts, with every block filled,
 *  distinct identities, and every draft quoting its author's thread. */
describe.each([
  ["cohort", COHORT, CORPUS],
  ["firms", FIRMS, FIRM_CORPUS],
])("seed set %s", (_name, members, papers) => {
  it("parses into nine-block cards", () => {
    for (const m of members) {
      const { blocks, confirmed } = cardBlocks(forgeDocument(m));
      expect(blocks.map((b) => b.key)).toEqual(BLOCKS.map(([k]) => k));
      expect(blocks.every((b) => b.entries.length === 1)).toBe(true);
      expect(confirmed).toBeGreaterThanOrEqual(5);
    }
  });
  it("keeps ids, emails and titles distinct", () => {
    const distinct = (xs: string[]) => new Set(xs).size === xs.length;
    expect(distinct(members.map((m) => m.ideaId))).toBe(true);
    expect(distinct(members.map((m) => m.email))).toBe(true);
    expect(distinct(members.map((m) => m.title))).toBe(true);
    expect(distinct(papers.map((p) => p.title))).toBe(true);
    expect(members.every((m) => /^[0-9a-f]{32}$/.test(m.ideaId))).toBe(true);
  });
  it("grounds every draft in what the author said", () => {
    for (const m of members) {
      for (const e of m.entries) {
        if (e.origin !== "draft") continue;
        expect(e.evidence, `${m.title} ${e.block}`).toBeTruthy();
        expect(m.said.some((s) => s.includes(e.evidence!)), `${m.title} ${e.block}`).toBe(true);
      }
    }
  });
});

it("names every firm fang-something", () => {
  expect(FIRMS.length).toBe(24);
  expect(FIRMS.every((m) => /^fang-[a-z]+$/.test(m.title))).toBe(true);
  expect(FIRMS.every((m) => m.email.endsWith(`@${m.title}.test`))).toBe(true);
});
