/** `npm run recompute -- [--edge cofounder] [--subject <person id>]
 *                        [--no-rerank] [--force-edges]`
 *
 *  A human runs this and reads the summary. A cron is a later decision. */
// Must come first: modules below read `process.env` when they load.
import "./env.mts";
import { getDb } from "../../src/db/client";
import { recompute } from "../../src/harness/founder/recompute";
import type { EdgeType } from "../../src/harness/schema";

const args = process.argv.slice(2);
const valueOf = (flag: string) => {
  const at = args.indexOf(flag);
  return at >= 0 ? args[at + 1] : undefined;
};

const db = await getDb();
const summary = await recompute(db, {
  edge: valueOf("--edge") as EdgeType | undefined,
  subject: valueOf("--subject"),
  noRerank: args.includes("--no-rerank"),
  forceEdges: args.includes("--force-edges"),
});

for (const [edge, written] of Object.entries(summary.edges)) {
  console.log(`${edge}: ${written} result(s) written`);
}
console.log(
  `rerank: ${summary.rerankCalls} call(s), ${summary.rerankCached} from cache — ${summary.note}`,
);
process.exit(0);
