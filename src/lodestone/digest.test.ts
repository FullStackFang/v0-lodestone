/** The digest's text form on a hand-built digest: what a thin hit says. The
 *  retrieval half is tested with the network in `network.test.ts`. */
import { describe, expect, it } from "vitest";
import { renderDigest, type Digest } from "./digest";
import type { PaperHit } from "./priorArt";

const paper = (title: string, thin: boolean): PaperHit => ({
  documentId: title, kind: "paper", querySet: "card-search", title, score: 0.81, blocks: ["Value proposition"], blockKeys: ["value_proposition"],
  year: 2024, venue: null, field: null, url: null, yours: false, addedAt: new Date("2026-10-10T00:00:00Z"), abstractHash: "0".repeat(64), thin,
  sentences: [{ text: "A sentence.", block: "value_proposition", cosine: 0.81 }],
});

describe("renderDigest", () => {
  it("says a thin hit is a summary only, after its title", () => {
    const digest: Digest = {
      since: new Date("2026-10-10T00:00:00Z"),
      until: new Date("2026-10-17T00:00:00Z"),
      newCards: 0,
      sections: [{ ideaId: "a".repeat(32), title: "Sublet, sight seen", peers: [], papers: [paper("Full abstract", false), paper("TLDR only", true)] }],
    };
    const text = renderDigest(digest);
    expect(text).toContain("corpus · Full abstract (2024) · closest to Value proposition · 0.81");
    expect(text).toContain("corpus · TLDR only (2024) · summary only · closest to Value proposition · 0.81");
    expect(text.match(/summary only/g)).toHaveLength(1);
  });
});
