import { describe, expect, it } from "vitest";
import { cpcSectionName, patentNumberOf } from "./patents";

describe("patentNumberOf", () => {
  it("drops the country and the kind code from a BigQuery publication number", () => {
    expect(patentNumberOf("US-10123456-B2")).toBe("10123456");
    expect(patentNumberOf("US-RE48123-E")).toBe("RE48123");
    expect(patentNumberOf("US-D912345-S1")).toBe("D912345");
    expect(patentNumberOf("US-10123456")).toBe("10123456");
  });

  it("still reads the forms a person pastes", () => {
    expect(patentNumberOf("10123456")).toBe("10123456");
    expect(patentNumberOf("US10123456B2")).toBe("10123456");
    expect(patentNumberOf("US 11,223,344")).toBe("11223344");
    expect(patentNumberOf("D912345")).toBe("D912345");
    expect(patentNumberOf("USD912345S1")).toBe("D912345");
    expect(patentNumberOf("RE48000E1")).toBe("RE48000");
  });
});

describe("cpcSectionName", () => {
  it("names the section of a CPC code or a bare section letter", () => {
    expect(cpcSectionName("G01K1/02")).toBe("G — Physics");
    expect(cpcSectionName("G")).toBe("G — Physics");
    expect(cpcSectionName("a61b5/00")).toBe("A — Human necessities");
    expect(cpcSectionName("H04L")).toBe("H — Electricity");
    expect(cpcSectionName("Y02P90/00")).toBe("Y — General tagging of new technological developments");
    expect(cpcSectionName("Z99")).toBeNull();
    expect(cpcSectionName("")).toBeNull();
    expect(cpcSectionName(null)).toBeNull();
  });
});
