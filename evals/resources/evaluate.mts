import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { createPgliteDb, type Db } from "../../src/db/client";
import { createSession } from "../../src/db/cards";
import { ensurePerson } from "../../src/harness/ledger";
import { enrollTestMember } from "../../src/pilot/test-fixtures";
import { createResearchIdea, importResource, listResourcesForPerson, recordOutcome, updateNeed } from "../../src/resources/service";
import { executeRefreshRun, startOwnerRefreshRun } from "../../src/resources/refresh-runs";
import { selectSuggestions } from "../../src/resources/suggestions";

process.chdir(path.resolve(import.meta.dirname, "../.."));
const output = process.argv[2];
assert(output, "Supply an explicit output JSON path.");
const files = ["evals/resources/scenarios.json", "scripts/resources/social-sample.json", "src/resources/matching.ts", "src/resources/service.ts", "src/resources/suggestions.ts", "src/resources/refresh-runs.ts", "evals/resources/evaluate.mts"];
const snapshots = await Promise.all(files.map(async file => ({ file, text: await readFile(file, "utf8") })));
const fixture = JSON.parse(snapshots[0].text) as { labels: string; cases: { id: string; group: string; idea: string; title: string; criteria: string; expected: string[]; reason: string }[] };
assert.equal(new Set(fixture.cases.map(c => c.id)).size, fixture.cases.length);
const sample = JSON.parse(snapshots[1].text);
const sourceIds = ["SC01", "SC06", "SC09"];
assert.equal(sample.length, sourceIds.length);
const db = await createPgliteDb();
const savedAllowlist = process.env.RESOURCE_CURATOR_EMAILS;
try {
  const email = "scenario-evaluation@fixture.invalid";
  process.env.RESOURCE_CURATOR_EMAILS = email;
  const owner = await ensurePerson(db, { name: "Agent evaluation (synthetic)", email });
  await enrollTestMember(db, owner);
  const sessionId = await createSession(db, owner);
  const sourceById = new Map<string, string>();
  for (let i = 0; i < sample.length; i++) sourceById.set((await importResource(db, owner, sample[i])).id, sourceIds[i]);
  const saved = new Map<string, Awaited<ReturnType<typeof createResearchIdea>>>();
  for (const scenario of fixture.cases) saved.set(scenario.id, await createResearchIdea(db, sessionId, { idea: scenario.idea, title: scenario.title, criteria: scenario.criteria }));
  const refresh = () => startOwnerRefreshRun(db, owner).then(handle => executeRefreshRun(db, handle));
  const firstRun = await refresh();
  const view = await listResourcesForPerson(db, owner);
  const results = fixture.cases.map(scenario => {
    const rows = selectSuggestions(view.recommendations, saved.get(scenario.id)!.card.id);
    const returned = rows.map(row => sourceById.get(row.resource.id)!).sort();
    const expected = [...scenario.expected].sort();
    return { ...scenario, returned, missing: expected.filter(id => !returned.includes(id)), unexpected: returned.filter(id => !expected.includes(id)),
      exact: JSON.stringify(returned) === JSON.stringify(expected),
      details: rows.map(row => ({ source: sourceById.get(row.resource.id), score: row.recommendation.score,
        terms: row.recommendation.explanation.matchedTerms, nextAction: row.recommendation.explanation.nextAction,
        hasConditionEvidence: row.resource.claims.some(c => c.facet === "conditions"),
        hasLimitationEvidence: row.resource.claims.some(c => c.facet === "limitations") })) };
  });
  // Operational assertions are separate from the agent's relevance labels.
  const secondRun = await refresh();
  assert.equal(secondRun.created, 0);
  const control = saved.get("S01")!;
  const first = view.recommendations.find(row => row.need.id === control.need.id && sourceById.get(row.resource.id) === "SC01")!;
  assert(first);
  await recordOutcome(db, owner, first.recommendation.id, "helped", "AGENT TEST ONLY: ask an organizer about mutual follow-up.");
  await refresh();
  assert.equal((await listResourcesForPerson(db, owner)).recommendations.find(row => row.recommendation.id === first.recommendation.id)?.recommendation.outcome, "helped");
  const base = { title: control.need.title, criteria: control.need.criteria, monitoring: true };
  await updateNeed(db, owner, control.need.id, { ...base, status: "paused" });
  await refresh();
  assert.equal((await listResourcesForPerson(db, owner)).recommendations.filter(row => row.need.id === control.need.id).length, 0);
  await updateNeed(db, owner, control.need.id, { ...base, status: "active" });
  assert.equal((await listResourcesForPerson(db, owner)).recommendations.filter(row => row.need.id === control.need.id).length, 0);
  await refresh();
  assert.equal(selectSuggestions((await listResourcesForPerson(db, owner)).recommendations, control.card.id).length, 3);
  await updateNeed(db, owner, control.need.id, {
    title: "Help people schedule company meetings", criteria: "Reduce administrative time; measure hours saved instead of social reconnection.", status: "active", monitoring: true,
  });
  await refresh();
  const revised = (await listResourcesForPerson(db, owner)).recommendations.find(row => row.recommendation.id === first.recommendation.id);
  const changedNeedFeedback = revised ? { title: revised.need.title, currentNeedRevision: revised.need.revision,
    recommendationNeedRevision: revised.recommendation.needRevision, outcome: revised.recommendation.outcome,
    note: revised.recommendation.outcomeNote, feedbackHasRecordedNeedRevision: "outcomeNeedRevision" in revised.recommendation } : null;
  const totalReturned = results.reduce((n, r) => n + r.returned.length, 0);
  const totalExpected = results.reduce((n, r) => n + r.expected.length, 0);
  const relevantReturned = results.reduce((n, r) => n + r.returned.filter(id => r.expected.includes(id)).length, 0);
  const positives = results.filter(r => r.expected.length);
  const negatives = results.filter(r => !r.expected.length);
  const report = { evaluatedAt: new Date().toISOString(), evaluationType: "agent_scenarios_not_user_usefulness", labels: fixture.labels,
    storage: "Fresh in-memory PGlite; no real participant data or usefulness writes", noMatcherTuning: true,
    hashes: Object.fromEntries(snapshots.map(({ file, text }) => [file, createHash("sha256").update(text).digest("hex")])),
    sources: sample.map((s: { sourceUrl: string; identifier: string }, i: number) => ({ id: sourceIds[i], url: s.sourceUrl, identifier: s.identifier })),
    metrics: { exactCases: results.filter(r => r.exact).length, totalCases: results.length, relevantReturned, totalReturned, totalExpected,
      positiveCasesWithRelevantResult: positives.filter(r => r.returned.some(id => r.expected.includes(id))).length, positiveCases: positives.length,
      correctlyEmpty: negatives.filter(r => r.returned.length === 0).length, negativeCases: negatives.length },
    operations: { firstRun, repeatCreated: secondRun.created, feedbackPersists: true, pausedHidden: true, staleHiddenUntilRefresh: true, resumeRestores: true },
    changedNeedFeedback, results };
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ output, metrics: report.metrics, operations: report.operations,
    cases: results.map(r => ({ id: r.id, expected: r.expected, returned: r.returned, exact: r.exact })) }, null, 2));
} finally {
  if (savedAllowlist === undefined) delete process.env.RESOURCE_CURATOR_EMAILS;
  else process.env.RESOURCE_CURATOR_EMAILS = savedAllowlist;
  await (db as Db & { $client: { close(): Promise<void> } }).$client.close();
}
