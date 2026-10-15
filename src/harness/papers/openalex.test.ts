import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hashText, normalize } from "../canonical";
import {
  citationLine,
  doiOf,
  fetchWork,
  fieldOf,
  provenanceOf,
  rebuildAbstract,
  titleOf,
  workUrl,
  type OpenAlexWork,
} from "./openalex";

const fixture = JSON.parse(
  readFileSync(path.join(process.cwd(), "evals", "harness", "papers", "inverted-index.json"), "utf8"),
) as { work: OpenAlexWork; expected_abstract: string; text_hash: string };

describe("rebuildAbstract", () => {
  it("places a word at each of its positions", () => {
    // "the" is listed once with two positions; a rebuild that took the first
    // would drop a token and move every offset after it.
    const text = rebuildAbstract(fixture.work.abstract_inverted_index);
    expect(text).toBe(fixture.expected_abstract);
    expect(text!.split(" ").filter((w) => w === "the")).toHaveLength(2);
  });

  it("skips a position no word claims rather than filling it", () => {
    const text = rebuildAbstract({ a: [0], c: [2] });
    expect(text).toBe("a c");
  });

  it("keeps an astral character whole", () => {
    const text = rebuildAbstract(fixture.work.abstract_inverted_index)!;
    expect(text).toContain("🧪");
    // Two code units, one code point — the unit every offset is counted in.
    expect(text.indexOf("🧪")).toBe(11);
    expect(text.slice(11, 13)).toBe("🧪");
  });

  it("is null when there is no index and when it is empty", () => {
    expect(rebuildAbstract(null)).toBeNull();
    expect(rebuildAbstract(undefined)).toBeNull();
    expect(rebuildAbstract({})).toBeNull();
  });
});

describe("the fixture hash", () => {
  it("equals the value recorded beside the fixture, byte for byte", () => {
    const rebuilt = rebuildAbstract(fixture.work.abstract_inverted_index)!;
    expect(normalize(rebuilt)).toBe(fixture.expected_abstract);
    expect(hashText(rebuilt)).toBe(fixture.text_hash);
  });
});

describe("workUrl", () => {
  const none = { mailto: "", apiKey: "" };

  it("takes a bare DOI, a doi.org URL and a W id", () => {
    expect(workUrl("10.1145/3530013", none)).toBe(
      "https://api.openalex.org/works/https://doi.org/10.1145/3530013",
    );
    expect(workUrl("https://doi.org/10.1145/3530013", none)).toBe(
      "https://api.openalex.org/works/https://doi.org/10.1145/3530013",
    );
    expect(workUrl("W2741809807", none)).toBe("https://api.openalex.org/works/W2741809807");
    expect(workUrl("https://openalex.org/W2741809807", none)).toBe(
      "https://api.openalex.org/works/W2741809807",
    );
  });

  it("adds the contact address when one is configured", () => {
    expect(workUrl("W1", { mailto: "a@b.edu", apiKey: "" })).toBe("https://api.openalex.org/works/W1?mailto=a%40b.edu");
  });

  it("carries the key beside the address, on a DOI lookup as on a W id", () => {
    const url = new URL(workUrl("10.1145/3530013", { mailto: "a@b.edu", apiKey: "k-1" }));
    expect(url.pathname).toBe("/works/https://doi.org/10.1145/3530013");
    expect(url.searchParams.get("api_key")).toBe("k-1");
    expect(url.searchParams.get("mailto")).toBe("a@b.edu");
    expect(new URL(workUrl("W1", { mailto: "", apiKey: "k-1" })).searchParams.get("api_key")).toBe("k-1");
  });

  it("reads the key and the address from the environment by default", () => {
    const saved = { OPENALEX_API_KEY: process.env.OPENALEX_API_KEY, OPENALEX_MAILTO: process.env.OPENALEX_MAILTO };
    try {
      process.env.OPENALEX_API_KEY = " k-env ";
      process.env.OPENALEX_MAILTO = "env@b.edu";
      const url = new URL(workUrl("W1"));
      expect(url.searchParams.get("api_key")).toBe("k-env");
      expect(url.searchParams.get("mailto")).toBe("env@b.edu");
      delete process.env.OPENALEX_API_KEY;
      expect(new URL(workUrl("W1")).searchParams.has("api_key")).toBe(false);
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it("refuses anything that is neither", () => {
    expect(() => workUrl("a paper about clinics", none)).toThrow(/not a DOI/);
  });
});

describe("doiOf", () => {
  it("strips the forms a person pastes", () => {
    expect(doiOf("10.1145/3530013")).toBe("10.1145/3530013");
    expect(doiOf("doi:10.1145/3530013")).toBe("10.1145/3530013");
    expect(doiOf("https://dx.doi.org/10.1145/3530013")).toBe("10.1145/3530013");
    expect(doiOf("W2741809807")).toBeNull();
  });
});

describe("reading the work", () => {
  it("takes the field from primary_topic", () => {
    expect(fieldOf(fixture.work)).toBe("Engineering");
    expect(fieldOf({})).toBeNull();
  });

  it("records what a citation needs and nothing that needs a second request", () => {
    const provenance = provenanceOf(fixture.work);
    expect(provenance).toMatchObject({
      doi: "10.5555/fixture.2026",
      openalex_id: "https://openalex.org/W9999999999",
      field: "Engineering",
      venue: "Journal of Fixtures",
      year: 2026,
      authors: ["A. Reader", "B. Writer"],
    });
    expect(citationLine(provenance, titleOf(fixture.work))).toBe(
      "A. Reader, B. Writer. (2026). A fixture abstract for the offset walk. Journal of Fixtures",
    );
  });

  it("shortens four or more authors", () => {
    const work: OpenAlexWork = {
      authorships: [1, 2, 3, 4].map((n) => ({ author: { display_name: `Author ${n}` } })),
      publication_year: 2020,
    };
    expect(citationLine(provenanceOf(work), "T")).toBe("Author 1 et al.. (2020). T");
  });
});

describe("fetchWork", () => {
  it("returns null for a 404 and throws for anything else", async () => {
    const missing = await fetchWork("W1", (async () => new Response("", { status: 404 })) as typeof fetch);
    expect(missing).toBeNull();
    await expect(
      fetchWork("W1", (async () => new Response("slow down", { status: 429 })) as typeof fetch),
    ).rejects.toThrow(/openalex 429/);
  });

  it("returns the work body", async () => {
    const work = await fetchWork("W1", (async () =>
      new Response(JSON.stringify(fixture.work), { status: 200 })) as typeof fetch);
    expect(fieldOf(work!)).toBe("Engineering");
  });
});
