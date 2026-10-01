import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { agreement, parseCsv, readSilver, sample } from "./silver";

function csv(text: string): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "silver-")), "id_ending_with_0.csv");
  writeFileSync(file, text, "utf8");
  return file;
}

describe("parseCsv", () => {
  it("reads quoted fields, doubled quotes and embedded newlines", () => {
    const rows = parseCsv('a,b\n"one, two","he said ""no"""\n"line\nbreak",z\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["one, two", 'he said "no"'],
      ["line\nbreak", "z"],
    ]);
  });
});

describe("readSilver", () => {
  it("finds the columns by name, whatever their order", () => {
    const file = csv('purpose,id,abstract\n"measure the cost",7,"We measure the cost of a diagnosis."\n');
    expect(readSilver(file)).toEqual([
      { id: "7", abstract: "We measure the cost of a diagnosis.", purpose: "measure the cost" },
    ]);
  });

  it("drops rows with no abstract or no purpose", () => {
    const file = csv('id,abstract,purpose\n1,"",x\n2,"an abstract",""\n3,"an abstract","a purpose"\n');
    expect(readSilver(file).map((r) => r.id)).toEqual(["3"]);
  });

  it("is empty — not an exception — when the file is not there", () => {
    expect(readSilver(path.join(tmpdir(), "no-such-silver.csv"))).toEqual([]);
  });

  it("is empty when the columns are not the ones this bench needs", () => {
    expect(readSilver(csv("a,b\n1,2\n"))).toEqual([]);
  });
});

describe("agreement", () => {
  it("is one for the same words and zero for none shared", () => {
    expect(agreement(["measure the cost of a diagnosis"], "measure the cost of a diagnosis")).toBe(1);
    expect(agreement(["measure the cost"], "build a bridge sensor")).toBe(0);
  });

  it("is partial for a partial overlap, ignoring case", () => {
    const value = agreement(["Measure the cost"], "measure the cost of a diagnosis");
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(1);
  });

  it("counts every purpose row the run wrote as one bag", () => {
    const split = agreement(["measure the cost", "of a diagnosis"], "measure the cost of a diagnosis");
    expect(split).toBe(1);
  });

  it("is zero when the run wrote no purpose at all", () => {
    expect(agreement([], "measure the cost")).toBe(0);
  });
});

describe("sample", () => {
  it("draws the same 500 every time", () => {
    const items = Array.from({ length: 2000 }, (_, i) => i);
    expect(sample(items, 500)).toEqual(sample(items, 500));
    expect(sample(items, 500)).toHaveLength(500);
  });
});
