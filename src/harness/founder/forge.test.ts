/** The fixture is the table. Set equality against one two-framework,
 *  two-sided idea, then the rules the spec states one at a time. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { assertions, extractionRuns, type AssertionRow } from "@/db/schema";
import { getCanonicalText } from "../canonical";
import { EMBEDDING_DIMENSIONS, type EmbedResult } from "../embed";
import { embedRun } from "../extract/core";
import type { LadderOutput } from "../extract/ladder";
import { ensurePerson } from "../ledger";
import {
  DEFAULT_PERSON_EMAIL,
  MAPS,
  embedForgeRows,
  forgeCli,
  forgeSubject,
  mapVersion,
  parseForgeIdea,
  pendingEmbeds,
  projectForgeIdea,
  type ForgeIdeaV2,
} from "./forge";

interface Expected {
  framework: string;
  key: string;
  facet: string;
  level: string | null;
  subject: string;
  text: string;
  confidence: string;
  source_type: string;
  segment: string | null;
  anchor: "anchored" | "ambiguous" | "unanchored";
  free_endpoint?: true;
}

const fixture = JSON.parse(
  readFileSync(path.join(process.cwd(), "evals", "harness", "founder", "forge-fixture.json"), "utf8"),
) as {
  document: ForgeIdeaV2;
  expected: Expected[];
  report: {
    written: number;
    superseded: number;
    retired: number;
    unchanged: number;
    anchored: number;
    ambiguous: number;
    unanchored: number;
    profile_skipped: number;
    unmapped_frameworks: string[];
  };
};

const IDEA = fixture.document.id;
const clone = (): ForgeIdeaV2 => structuredClone(fixture.document);

let db: Db;

beforeEach(async () => {
  db = await createPgliteDb();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Every active row the projection owns — Forge rows and their rungs. */
async function active(): Promise<AssertionRow[]> {
  return db
    .select()
    .from(assertions)
    .where(and(eq(assertions.status, "active"), sql`${assertions.provenance} ->> 'kind' = 'forge'`));
}

function shape(row: AssertionRow): Expected {
  const p = row.provenance as Record<string, unknown>;
  const out: Expected = {
    framework: String(p.framework),
    key: String(p.key),
    facet: String(row.facet),
    level: row.abstractionLevel,
    subject: row.subjectType,
    text: row.text,
    confidence: row.confidence,
    source_type: row.sourceType,
    segment: (p.segment as string | undefined) ?? null,
    anchor: row.textHash ? "anchored" : p.anchor === "ambiguous" ? "ambiguous" : "unanchored",
  };
  if (p.free_endpoint === true) out.free_endpoint = true;
  return out;
}

const byKey = (a: { framework: string; key: string }, b: { framework: string; key: string }) =>
  a.framework.localeCompare(b.framework) || a.key.localeCompare(b.key);

const keyed = (rows: AssertionRow[], key: string) =>
  rows.filter((r) => (r.provenance as Record<string, unknown>).key === key);

const fakeEmbed = vi.fn(async (texts: string[]): Promise<EmbedResult> => ({
  vectors: texts.map(() => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, d) => (d === 0 ? 1 : 0))),
  embedded: true,
  model: "voyage-3.5",
  tokens: texts.length,
}));

describe("projectForgeIdea — the fixture", () => {
  it("writes exactly the fixture's assertions on a first import", async () => {
    await projectForgeIdea(db, fixture.document);
    const rows = await active();
    expect(rows.map(shape).sort(byKey)).toEqual([...fixture.expected].sort(byKey));
  });

  it("reports the fixture's counts", async () => {
    const report = await projectForgeIdea(db, fixture.document);
    expect({
      written: report.written,
      superseded: report.superseded,
      retired: report.retired,
      unchanged: report.unchanged,
      anchored: report.anchored,
      ambiguous: report.ambiguous,
      unanchored: report.unanchored,
      profile_skipped: report.profileSkipped,
      unmapped_frameworks: report.unmappedFrameworks,
    }).toEqual(fixture.report);
    expect(report.warnings).toEqual([]);
  });
});

describe("projectForgeIdea — the table", () => {
  it("lands BMC rows on their facets with the entry's text", async () => {
    await projectForgeIdea(db, fixture.document);
    const rows = await active();
    for (const [key, facet] of [
      ["k-vp-drivers", "purpose"],
      ["k-channels", "mechanism.distribution"],
      ["k-revenue", "mechanism.revenue"],
      ["k-cost", "constraint"],
    ] as const) {
      const [row] = keyed(rows, key);
      expect(row.facet).toBe(facet);
      expect(row.subjectId).toBe(forgeSubject(IDEA));
    }
  });

  it("reports an unknown framework and writes nothing for it", async () => {
    const doc = clone();
    doc.workspaces[1].framework = "lean_canvas";
    const report = await projectForgeIdea(db, doc);
    expect(report.unmappedFrameworks).toEqual(["lean_canvas"]);
    const rows = await active();
    expect(rows.some((r) => (r.provenance as Record<string, unknown>).framework === "lean_canvas")).toBe(false);
    expect(keyed(rows, "k-job")).toEqual([]);
  });

  it("makes no model call and no network request by default", async () => {
    const fetch = vi.fn(() => {
      throw new Error("network");
    });
    vi.stubGlobal("fetch", fetch);
    await projectForgeIdea(db, fixture.document);
    expect(fetch).not.toHaveBeenCalled();
    const rows = await active();
    expect(rows.every((r) => r.embedding === null)).toBe(true);
  });
});

describe("projectForgeIdea — origin", () => {
  it("writes a kept draft as the author's, and it passes confirmed_is_human", async () => {
    await projectForgeIdea(db, fixture.document);
    const [row] = keyed(await active(), "k-vp-drivers");
    expect(row.confidence).toBe("confirmed");
    expect(row.sourceType).toBe("subject_edit");
  });

  it("never writes repeated or corroborated", async () => {
    await projectForgeIdea(db, fixture.document);
    const rows = await active();
    expect(rows.every((r) => r.confidence === "extracted" || r.confidence === "confirmed")).toBe(true);
  });

  it("writes an open entry with no vector, and no back-fill ever gives it one", async () => {
    await projectForgeIdea(db, fixture.document);
    const [open] = keyed(await active(), "k-cost");
    expect(open.embedding).toBeNull();
    expect((open.provenance as Record<string, unknown>).free_endpoint).toBe(true);

    const pending = await pendingEmbeds(db, IDEA);
    expect(pending.some((r) => r.id === open.id)).toBe(false);
    await embedForgeRows(db, pending, fakeEmbed);

    const [run] = await db.select().from(extractionRuns).where(eq(extractionRuns.id, open.extractionRunId!));
    await embedRun(db, run, fakeEmbed);

    const [after] = await db.select().from(assertions).where(eq(assertions.id, open.id));
    expect(after.status).toBe("active");
    expect(after.embedding).toBeNull();
    const sent = fakeEmbed.mock.calls.flatMap((call) => call[0]);
    expect(sent).not.toContain(open.text);
  });
});

describe("projectForgeIdea — anchoring", () => {
  it("places a sentence that occurs once, quote equal to the slice", async () => {
    await projectForgeIdea(db, fixture.document);
    const [row] = keyed(await active(), "k-revenue");
    expect(row.textHash).not.toBeNull();
    const canonical = (await getCanonicalText(db, row.textHash!))!;
    expect(canonical.slice(row.startOff!, row.endOff!)).toBe(row.quote);
    expect(row.quote).toBe("We charge riders a flat booking fee.");
    expect(canonical).toContain(" ¶ ");
    expect(canonical).not.toContain("Who pays for insurance");
  });

  it("does not guess a sentence that occurs twice", async () => {
    await projectForgeIdea(db, fixture.document);
    const [row] = keyed(await active(), "k-vp-riders");
    expect(row.textHash).toBeNull();
    expect(row.quote).toBeNull();
    expect((row.provenance as Record<string, unknown>).evidence).toBe("Riders hate surge pricing.");
  });

  it("keeps an intake quote it cannot find, unanchored", async () => {
    await projectForgeIdea(db, fixture.document);
    const [row] = keyed(await active(), "k-channels");
    expect(row.textHash).toBeNull();
    expect((row.provenance as Record<string, unknown>).evidence).toBe(
      "Referral bonuses drove 60% of sign-ups in the pilot.",
    );
  });
});

describe("projectForgeIdea — sides and the person", () => {
  it("keeps two sides as two rows, each naming its own side", async () => {
    await projectForgeIdea(db, fixture.document);
    const rows = await active();
    const purposes = rows.filter(
      (r) => r.facet === "purpose" && r.abstractionLevel === "specific",
    );
    expect(purposes.map((r) => (r.provenance as Record<string, unknown>).segment).sort()).toEqual([
      "Drivers",
      "Riders",
    ]);
    expect(rows.some((r) => r.text === "Drivers" || r.text === "Riders")).toBe(false);
  });

  it("files a resource and mapped profile facts on the local person", async () => {
    await projectForgeIdea(db, fixture.document);
    const personId = await ensurePerson(db, { name: "Forge author", email: DEFAULT_PERSON_EMAIL });
    const rows = await active();
    const [resource] = keyed(rows, "k-resources");
    expect(resource.subjectType).toBe("person");
    expect(resource.subjectId).toBe(personId);
    expect(resource.facet).toBe("mechanism_commanded");
    expect(rows.some((r) => r.text === "green")).toBe(false);
  });

  it("uses the person the caller names", async () => {
    await projectForgeIdea(db, fixture.document, { personEmail: "Me@Example.org" });
    const personId = await ensurePerson(db, { name: "x", email: "me@example.org" });
    const [resource] = keyed(await active(), "k-resources");
    expect(resource.subjectId).toBe(personId);
  });
});

describe("projectForgeIdea — re-import", () => {
  it("writes nothing when the same document is imported twice", async () => {
    await projectForgeIdea(db, fixture.document);
    const before = await db.select({ n: sql<number>`count(*)::int` }).from(assertions);
    const runsBefore = await db.select({ n: sql<number>`count(*)::int` }).from(extractionRuns);
    const report = await projectForgeIdea(db, fixture.document);
    const after = await db.select({ n: sql<number>`count(*)::int` }).from(assertions);
    const runsAfter = await db.select({ n: sql<number>`count(*)::int` }).from(extractionRuns);
    expect(after[0].n).toBe(before[0].n);
    expect(runsAfter[0].n).toBe(runsBefore[0].n);
    expect(report.written).toBe(0);
    expect(report.unchanged).toBe(fixture.expected.length);
  });

  it("supersedes an edited entry and keeps one active row per key", async () => {
    await projectForgeIdea(db, fixture.document);
    const [old] = keyed(await active(), "k-revenue");
    const doc = clone();
    doc.workspaces[0].canvas.find((e) => e.key === "k-revenue")!.text = "A flat booking fee on every ride";
    const report = await projectForgeIdea(db, doc);
    expect(report.superseded).toBe(1);
    expect(report.written).toBe(1);

    const [prior] = await db.select().from(assertions).where(eq(assertions.id, old.id));
    expect(prior.status).toBe("superseded");
    const current = keyed(await active(), "k-revenue");
    expect(current).toHaveLength(1);
    expect(prior.supersededBy).toBe(current[0].id);
    expect(current[0].text).toBe("A flat booking fee on every ride");
  });

  it("supersedes when only the origin changes — a draft confirmed", async () => {
    await projectForgeIdea(db, fixture.document);
    const doc = clone();
    doc.workspaces[0].canvas.find((e) => e.key === "k-revenue")!.origin = "confirmed";
    await projectForgeIdea(db, doc);
    const current = keyed(await active(), "k-revenue");
    expect(current).toHaveLength(1);
    expect(current[0].confidence).toBe("confirmed");
  });

  it("retires an entry the export no longer carries, and deletes nothing", async () => {
    await projectForgeIdea(db, fixture.document);
    const total = await db.select({ n: sql<number>`count(*)::int` }).from(assertions);
    const [old] = keyed(await active(), "k-channels");
    const doc = clone();
    doc.workspaces[0].canvas = doc.workspaces[0].canvas.filter((e) => e.key !== "k-channels");
    const report = await projectForgeIdea(db, doc);
    expect(report.retired).toBe(1);
    const [row] = await db.select().from(assertions).where(eq(assertions.id, old.id));
    expect(row.status).toBe("superseded");
    expect(row.supersededBy).toBeNull();
    const after = await db.select({ n: sql<number>`count(*)::int` }).from(assertions);
    expect(after[0].n).toBe(total[0].n);
  });
});

describe("projectForgeIdea — the run", () => {
  it("claims one model-free run per workspace, versioned by its table", async () => {
    const report = await projectForgeIdea(db, fixture.document);
    const runs = await db.select().from(extractionRuns);
    expect(runs).toHaveLength(2);
    for (const run of runs) {
      expect(run.variant).toBe("forge");
      expect(run.model).toBe("none");
      expect(run.status).toBe("ok");
    }
    const bmc = report.runs.find((r) => r.framework === "business_model")!;
    expect(bmc.promptVersion).toBe(mapVersion(MAPS.business_model));
  });

  it("a changed table is a new version", async () => {
    const first = await projectForgeIdea(db, fixture.document);
    const changed = {
      ...MAPS,
      business_model: {
        ...MAPS.business_model,
        channels: { subject: "idea" as const, facet: "mechanism.product" as const, level: null },
      },
    };
    const second = await projectForgeIdea(db, fixture.document, { maps: changed });
    const v1 = first.runs.find((r) => r.framework === "business_model")!.promptVersion;
    const v2 = second.runs.find((r) => r.framework === "business_model")!.promptVersion;
    expect(v2).not.toBe(v1);
    const [channels] = keyed(await active(), "k-channels");
    expect(channels.facet).toBe("mechanism.product");
  });

  it("lifts every Forge purpose with the ladder when asked", async () => {
    const structured = vi.fn(async (_schema: unknown, request: { prompt: string }) => {
      const count = request.prompt.split("\n").filter((l) => /^\d+\. /.test(l)).length;
      const output: LadderOutput = {
        rungs: Array.from({ length: count }).flatMap((_, of) => [
          { of, abstraction_level: "abstract" as const, text: `abstract ${of}` },
          { of, abstraction_level: "core" as const, text: `core ${of}` },
        ]),
      };
      return { output, model: "fake", usage: null };
    });
    await projectForgeIdea(db, fixture.document, { ladder: true }, { structured: structured as never });
    const specifics = (await active()).filter((r) => r.facet === "purpose" && r.abstractionLevel === "specific");
    expect(specifics.length).toBe(2);
    for (const specific of specifics) {
      const rungs = await db
        .select()
        .from(assertions)
        .where(and(eq(assertions.status, "active"), sql`${assertions.provenance} ->> 'ladder_of' = ${specific.id}`));
      expect(rungs.map((r) => r.abstractionLevel).sort()).toEqual(["abstract", "core"]);
      for (const rung of rungs) expect(rung.provenance).toEqual({ kind: "ladder", ladder_of: specific.id });
    }
  });
});

describe("forgeCli", () => {
  const io = (log: string[], embed = fakeEmbed) => ({
    readFile: () => JSON.stringify(fixture.document),
    log: (line: string) => log.push(line),
    embed: async (texts: string[]) => {
      log.push(`EMBED ${texts.length}`);
      return embed(texts);
    },
    embeddingModel: "voyage-3.5",
  });

  it("runs offline by default: no request, every row written, every vector null", async () => {
    const fetch = vi.fn(() => {
      throw new Error("network");
    });
    vi.stubGlobal("fetch", fetch);
    const log: string[] = [];
    const code = await forgeCli(db, ["idea.json"], io(log));
    expect(code).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(log.some((l) => l.startsWith("EMBED"))).toBe(false);
    const rows = await active();
    expect(rows).toHaveLength(fixture.expected.length);
    expect(rows.every((r) => r.embedding === null)).toBe(true);
    expect(log).toContain("rows: 12 written (0 superseding), 0 retired, 0 unchanged");
    expect(log).toContain("evidence: 3 anchored, 1 ambiguous, 6 unanchored");
  });

  it("names what leaves before the first request, and never sends an open row", async () => {
    fakeEmbed.mockClear();
    const log: string[] = [];
    const code = await forgeCli(db, ["idea.json", "--embed", "voyage"], io(log));
    expect(code).toBe(0);
    const announce = log.findIndex((l) => l.startsWith("sending 11 rows to voyage-3.5"));
    const first = log.findIndex((l) => l.startsWith("EMBED"));
    expect(announce).toBeGreaterThanOrEqual(0);
    expect(announce).toBeLessThan(first);
    expect(log[announce]).toContain('"purpose@specific":2');
    const sent = fakeEmbed.mock.calls.flatMap((call) => call[0]);
    expect(sent).toHaveLength(11);
    expect(sent).not.toContain("Who carries the insurance?");
  });

  it("refuses an unknown embedder rather than guessing one", async () => {
    const log: string[] = [];
    expect(await forgeCli(db, ["idea.json", "--embed", "openai"], io(log))).toBe(1);
    expect(log[0]).toMatch(/^usage:/);
    expect(await active()).toHaveLength(0);
  });
});

describe("parseForgeIdea", () => {
  it("reads forge-idea/3 and the papers the author holds, and /2 as holding none", () => {
    const v3 = parseForgeIdea({
      ...fixture.document,
      format: "forge-idea/3",
      already_have: [{ id: "W1", title: "A paper", doi: "10.1/x" }, { id: "W2", title: "Another" }],
    });
    expect(v3.format).toBe("forge-idea/3");
    expect(v3.stableKeys).toBe(true);
    expect(v3.alreadyHave).toEqual([
      { id: "W1", title: "A paper", doi: "10.1/x" },
      { id: "W2", title: "Another", doi: null },
    ]);
    expect(parseForgeIdea({ ...fixture.document, format: "forge-idea/3" }).alreadyHave).toEqual([]);
    expect(parseForgeIdea(fixture.document).alreadyHave).toEqual([]);
    expect(() =>
      parseForgeIdea({ ...fixture.document, format: "forge-idea/3", already_have: [{ title: "no id" }] }),
    ).toThrow();
  });

  it("reads forge-idea/4 as /3, ignoring the support beside each workspace", () => {
    const support = [
      { block: "cost_structure", entry_key: null, document_id: "d1", kind: "paper", title: "T",
        citation: "A (2021). T.", sentence: "Margins fall.", stance: "contradicts", run_id: "r1" },
    ];
    const v4 = parseForgeIdea({
      ...fixture.document,
      format: "forge-idea/4",
      already_have: [{ id: "W1", title: "A paper", doi: null }],
      workspaces: fixture.document.workspaces.map((w) => ({ ...w, support })),
    });
    const v3 = parseForgeIdea({ ...fixture.document, format: "forge-idea/3", already_have: [{ id: "W1", title: "A paper", doi: null }] });
    expect(v4.format).toBe("forge-idea/4");
    expect({ ...v4, format: v3.format }).toEqual(v3);
    expect(JSON.stringify(v4.workspaces)).not.toContain("Margins fall.");
  });

  it("rejects a document that is not a forge-idea", () => {
    expect(() => parseForgeIdea({ format: "forge-idea/9" })).toThrow();
    expect(() => parseForgeIdea({ ...fixture.document, workspaces: [{ framework: 1 }] })).toThrow();
  });

  it("reads forge-idea/1 as one BMC workspace, and warns it cannot supersede", async () => {
    const v1 = {
      format: "forge-idea/1",
      title: "Flat Fare",
      line: "A ride-hail with no surge pricing.",
      grade: null,
      segments: [{ name: "Drivers", origin: "confirmed" }],
      canvas: [
        { block: "revenue_streams", text: "Flat booking fee per ride", origin: "draft", evidence: null, segment: null },
        { block: "value_proposition", text: "Drivers keep 90%", origin: "confirmed", evidence: null, segment: "Drivers" },
      ],
      profile: {},
      thread: [{ role: "you", text: "Hello.", at: "2026-09-01T10:00:00Z" }],
    };
    const first = await projectForgeIdea(db, v1);
    expect(first.format).toBe("forge-idea/1");
    expect(first.written).toBe(2);
    expect(first.warnings.join(" ")).toMatch(/no stable keys/i);
    const rows = await active();
    expect(rows.map((r) => r.facet).sort()).toEqual(["mechanism.revenue", "purpose"]);

    // No keys: a re-import writes the entries again, as the warning said.
    const second = await projectForgeIdea(db, v1);
    expect(second.written).toBe(2);
    expect(await active()).toHaveLength(4);
  });
});
