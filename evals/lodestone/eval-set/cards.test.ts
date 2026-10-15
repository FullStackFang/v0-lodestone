import { describe, expect, it } from "vitest";
import { parseForgeIdea } from "../../../src/harness/founder/forge";
import { BLOCKS } from "../../../src/lodestone/cards";
import { EVAL_CARDS, evalIdeaId } from "./cards";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("eval-set cards", () => {
  it("files twenty forge-idea/4 cards, every one with all nine blocks", () => {
    expect(EVAL_CARDS).toHaveLength(20);
    for (const card of EVAL_CARDS) {
      const parsed = parseForgeIdea(card.doc);
      expect(parsed.format).toBe("forge-idea/4");
      expect(parsed.ideaId).toBe(card.ideaId);
      expect(new Set(parsed.workspaces[0].canvas.map((e) => e.block))).toEqual(new Set(BLOCKS.map(([k]) => k)));
    }
  });

  it("gives each card a stable uuid of its own", () => {
    const ids = EVAL_CARDS.map((c) => c.ideaId);
    expect(new Set(ids).size).toBe(20);
    for (const id of ids) expect(id).toMatch(UUID);
    expect(evalIdeaId("pulse")).toBe(EVAL_CARDS.find((c) => c.slug === "pulse")!.ideaId);
    expect(evalIdeaId("pulse")).toMatchInlineSnapshot(`"7f231fbc-2b40-4fae-8f24-a2c66d8aa5a1"`);
  });
});
