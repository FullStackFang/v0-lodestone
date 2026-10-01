import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalize } from "../canonical";
import { devFiles, facetOfLabel, readAbstract, rebuild, sample, segmentsOf } from "./coda";
import { score } from "./tokens";

/** One record in the shape the release ships: paragraphs of sentences of
 *  segments, each segment with its crowd label. */
const RECORD = {
  paper_id: "abc",
  metadata: { title: "A paper", coda_data_split: "dev" },
  abstract: [
    {
      original_text: "…",
      sentences: [
        [{ segment_text: "Bats are natural reservoirs of SARS-CoV .", crowd_label: "background" }],
        [{ segment_text: "We tested the cell tropism of the virus .", crowd_label: "purpose" }],
        [{ segment_text: "A pseudovirus was produced using the spike protein .", crowd_label: "method" }],
        [{ segment_text: "Susceptible cells expressed red fluorescence .", crowd_label: "finding" }],
      ],
    },
  ],
};

function corpus(): string {
  const root = mkdtempSync(path.join(tmpdir(), "coda-"));
  for (const split of ["train", "dev", "test"]) {
    mkdirSync(path.join(root, "human_label", split), { recursive: true });
    writeFileSync(
      path.join(root, "human_label", split, `${split}-one.json`),
      JSON.stringify({ ...RECORD, paper_id: split }),
      "utf8",
    );
  }
  return root;
}

describe("facetOfLabel", () => {
  it("maps the two classes and nothing else", () => {
    expect(facetOfLabel("purpose")).toBe("purpose");
    expect(facetOfLabel("Method")).toBe("mechanism");
    expect(facetOfLabel("background")).toBeNull();
    expect(facetOfLabel("finding")).toBeNull();
    expect(facetOfLabel("other")).toBeNull();
  });
});

describe("segmentsOf", () => {
  it("finds the segments wherever the release nests them", () => {
    const segments = segmentsOf(RECORD);
    expect(segments).toHaveLength(4);
    expect(segments[1]).toEqual({
      text: "We tested the cell tropism of the virus .",
      facet: "purpose",
    });
    expect(segments[3].facet).toBeNull();
  });
});

describe("devFiles", () => {
  it("reads the dev split and never the test split", () => {
    const root = corpus();
    const files = devFiles(root).map((f) => f.replaceAll("\\", "/"));
    expect(files).toHaveLength(1);
    expect(files[0]).toContain("/dev/");
    expect(files.some((f) => f.includes("/test/"))).toBe(false);
    expect(files.some((f) => f.includes("/train/"))).toBe(false);
  });

  it("is empty rather than throwing when the corpus is not there", () => {
    expect(devFiles(path.join(tmpdir(), "no-coda-here"))).toEqual([]);
  });

  it("refuses a test-split path outright", () => {
    const root = corpus();
    expect(() => readAbstract(path.join(root, "human_label", "test", "test-one.json"))).toThrow(
      /test split is never read/,
    );
  });
});

describe("rebuild", () => {
  it("joins the segments with single spaces and places the labels in the join", () => {
    const item = rebuild({ id: "abc", segments: segmentsOf(RECORD) })!;
    expect(item.text).toBe(normalize(segmentsOf(RECORD).map((s) => s.text).join(" ")));
    expect(item.gold).toHaveLength(2);

    for (const span of item.gold) {
      const slice = item.text.slice(span.start, span.end);
      if (span.facet === "purpose") expect(slice).toBe("We tested the cell tropism of the virus .");
      else expect(slice).toBe("A pseudovirus was produced using the spike protein .");
    }
  });

  it("produces spans the scorer can score against itself for a perfect run", () => {
    const item = rebuild({ id: "abc", segments: segmentsOf(RECORD) })!;
    expect(score(item.text, item.gold, item.gold).headline).toBe(1);
  });
});

describe("sample", () => {
  it("is the same set every time for one seed", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    expect(sample(items, 10)).toEqual(sample(items, 10));
    expect(sample(items, 10)).toHaveLength(10);
    expect(sample(items, 100)).toHaveLength(50);
  });
});
