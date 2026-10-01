/** The rules that are only true if nothing quietly stops obeying them.
 *
 * Each of these is a grep, and each one guards a decision that is cheap to
 * break by accident: the tag vocabulary living in a table rather than in
 * code, the reader being resolved through the contract, the scorer having
 * exactly one implementation, and a reading's mode being a promise made at
 * the start. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BENCHES } from "../bench/registry";

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const sourceFiles = (dir: string) =>
  walk(path.join(ROOT, dir)).filter((file) => !/\.test\.tsx?$/.test(file));

const relative = (file: string) => path.relative(ROOT, file).replaceAll("\\", "/");

function hits(files: string[], pattern: RegExp): { file: string; line: string }[] {
  const out: { file: string; line: string }[] = [];
  for (const file of files) {
    // Split on either ending: git checks these files out with CRLF here, and
    // a trailing \r defeats the comment strip below — `.` never matches it,
    // so `$` never lands and the prose grepped as if it were code.
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      // A rule about code is not a rule about the prose beside it.
      const code = line.replace(/^\s*(\*|\/\/).*$/, "");
      if (pattern.test(code)) out.push({ file: relative(file), line: line.trim() });
    }
  }
  return out;
}

const PAPERS = sourceFiles("src/harness/papers");
const APP = sourceFiles("src/app");
const isPaperTagConsumer = (file: string, source: string) =>
  /^src\/app\/(read|annotations|reconcile|harness)\//.test(file) ||
  /@\/harness\/papers\/|\btagFacetMap\b/.test(source);
const PAPER_APP = APP.filter((file) => isPaperTagConsumer(relative(file), readFileSync(file, "utf8")));

describe("the tag vocabulary lives in `tag_facet_map`", () => {
  it("does not confuse ordinary form fields with the paper tag namespace", () => {
    for (const file of ["library/actions.ts", "me/profile-content.tsx", "resources/page.tsx"]) {
      expect(isPaperTagConsumer(`src/app/${file}`, '<input name="intent" /><textarea name="note" />')).toBe(false);
    }
  });

  it("continues guarding reader routes and tag consumers elsewhere in the app", () => {
    for (const route of ["read/[artifactId]", "annotations", "reconcile", "harness"]) {
      expect(isPaperTagConsumer(`src/app/${route}/actions.ts`, 'const tag = "intent";')).toBe(true);
    }
    expect(isPaperTagConsumer("src/app/new-research/page.tsx", 'import { saveAnnotation } from "@/harness/papers/annotate";')).toBe(true);
    expect(isPaperTagConsumer("src/app/new-research/page.tsx", 'import { tagFacetMap } from "@/db/schema";')).toBe(true);
  });

  it("is named in no module but the key handler", () => {
    // `constraint` is left out: it is also a facet, and the facet
    // vocabulary is the contract's, named freely. The other five are tags
    // in the reader track, but may also name ordinary fields elsewhere.
    const tags = /["'](intent|insight|eval|how|note)["']/;
    const offenders = hits([...PAPERS, ...PAPER_APP], tags).filter(
      (hit) => !hit.file.endsWith("read/[artifactId]/Reader.tsx"),
    );
    expect(offenders).toEqual([]);
  });

  it("is never branched on", () => {
    const branch = /\b(tag|mechanismSubtype)\s*===/;
    const offenders = hits(PAPERS, branch);
    expect(offenders).toEqual([]);
  });
});

describe("the reader is the contract's person", () => {
  it("is resolved through `readerPerson()` and never from the environment", () => {
    const offenders = hits([...PAPERS, ...APP], /process\.env\.HARNESS_READER/);
    expect(offenders).toEqual([]);
  });
});

describe("there is one band-pass implementation", () => {
  it("is not re-implemented under `papers/`", () => {
    // `judge.ts` is excluded from the λ rule for one reason: it *records*
    // the parameters its caller read, into the judgment's context, so a
    // later re-tuning knows what ordering the reader was judging. It never
    // looks them up.
    const scoring = hits(PAPERS, /match_params|matchParams|\blambda\b|\bmu\b/).filter(
      (hit) => !hit.file.endsWith("papers/judge.ts"),
    );
    expect(scoring).toEqual([]);
  });

  it("keeps `<=>` out of every module but the attribution lookup", () => {
    const offenders = hits(PAPERS, /<=>/).filter((hit) => !hit.file.endsWith("papers/attribute.ts"));
    expect(offenders).toEqual([]);
  });

  it("imports the scorer rather than a cosine", () => {
    const analogy = readFileSync(path.join(ROOT, "src/harness/papers/analogy.ts"), "utf8");
    expect(analogy).toContain('from "../match/bandpass"');
    expect(analogy).not.toMatch(/function cosine/);
  });
});

describe("a reading's mode is written once", () => {
  it("is set at creation and nowhere else", () => {
    const writes = hits([...PAPERS, ...APP], /\.update\(readingSessions\)/);
    for (const write of writes) {
      // The only update is the end stamp.
      expect(write.line).not.toMatch(/mode/);
    }
    const inserts = hits([...PAPERS, ...APP], /\.insert\(readingSessions\)/);
    expect(inserts.map((i) => i.file)).toEqual(["src/harness/papers/reading.ts"]);
  });

  it("is never inferred from how long the sitting was", () => {
    const inference = hits([...PAPERS, ...APP], /mode\s*=\s*["']exhaustive["']/);
    expect(inference).toEqual([]);
  });
});

describe("every bench this change lands was pre-registered", () => {
  it("adds no name to the registry", () => {
    const implemented = readdirSync(path.join(ROOT, "src/harness/bench"))
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .map((file) => file.replace(/\.ts$/, ""))
      // The registry, the writer, the interval and the shared scorer are
      // not benches; the names that match a bench are.
      .filter((name) => (BENCHES as readonly string[]).includes(name));
    for (const name of implemented) expect(BENCHES).toContain(name);
    const registry = readFileSync(path.join(ROOT, "src/harness/bench/registry.ts"), "utf8");
    expect(registry).toContain('["vocab", "gold", "coda", "silver", "final", "pairs"]');
  });
});
