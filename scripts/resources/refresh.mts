import "../harness/env.mts";
import { parseArgs } from "node:util";
import { z } from "zod";
import { getDb } from "../../src/db/client";
import { claimScheduledRun, executeRefreshRun } from "../../src/resources/refresh-runs";

try {
  const { values } = parseArgs({ options: { slot: { type: "string" }, help: { type: "boolean" } }, strict: true });
  if (values.help) {
    console.log("npm run resources:refresh -- --slot <02:00 UTC ISO instant>\nRun the fenced daily global refresh. Replays a successful slot without duplicate work; exits nonzero on failure.");
  } else {
    const slot = z.string().min(1).parse(values.slot);
    const db = await getDb();
    const claim = await claimScheduledRun(db, slot);
    if (claim.kind === "busy") throw new Error("A global refresh is already running.");
    if (claim.kind === "replayed") console.log(JSON.stringify({ status: "replayed", runId: claim.run.id }));
    else console.log(JSON.stringify({ status: "succeeded", runId: claim.run.id, ...(await executeRefreshRun(db, claim.handle)) }));
  }
  process.exit(0);
} catch (error) {
  console.error(error instanceof z.ZodError ? "A valid --slot is required." : "Scheduled refresh failed.");
  process.exit(1);
}
