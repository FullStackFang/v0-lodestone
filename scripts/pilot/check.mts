import { checkPilotReadiness } from "../../src/pilot/preflight.ts";

const result = await checkPilotReadiness();
for (const check of result.checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"} ${check.id}: ${check.detail}`);
}
process.exit(result.ok ? 0 : 1);
