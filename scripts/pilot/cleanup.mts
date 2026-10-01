import { getDb } from "../../src/db/client";
import { cleanupRefreshRuns } from "../../src/resources/refresh-runs";
import { cleanupPilotActivity } from "../../src/pilot/measurement";

try {
  const db = await getDb();
  const removedRuns = await cleanupRefreshRuns(db);
  const removedActivity = await cleanupPilotActivity(db);
  console.log(JSON.stringify({ removedRuns, removedActivity }));
  process.exit(0);
} catch {
  console.error("Pilot cleanup failed.");
  process.exit(1);
}
