/** `tsx scripts/harness/fetch-coda.mts` — put CODA-19 where `bench -- coda`
 *  can read it.
 *
 * A shallow clone into `data/harness/coda19/`, which is gitignored: the
 * corpus states no licence, and nothing here redistributes it. Re-running
 * with the directory already present does nothing. */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const REPO = "https://github.com/windx0303/CODA-19.git";
const DEST = path.join(process.cwd(), "data", "harness", "coda19");

if (existsSync(DEST)) {
  console.log(`already there: ${DEST}`);
  process.exit(0);
}

mkdirSync(path.dirname(DEST), { recursive: true });
console.log(`cloning ${REPO} into ${DEST} (shallow) …`);

const result = spawnSync("git", ["clone", "--depth", "1", REPO, DEST], { stdio: "inherit" });
if (result.status !== 0) {
  console.error(
    "clone failed. Download the repository by hand and unpack it at " +
      `${DEST} — the bench needs its human_label/dev split and nothing else.`,
  );
  process.exit(1);
}

// The corpus ships as one zip inside the repository; the labels are of no
// use until it is open.
const archive = path.join(DEST, "data", "CODA19_v1_20200504.zip");
if (existsSync(archive)) {
  console.log("unpacking the corpus …");
  const unzip = spawnSync(
    "powershell",
    ["-NoProfile", "-Command", `Expand-Archive -Path '${archive}' -DestinationPath '${path.dirname(archive)}' -Force`],
    { stdio: "inherit" },
  );
  if (unzip.status !== 0) {
    console.error(`could not unpack ${archive}. Unzip it in place and re-run the bench.`);
    process.exit(1);
  }
}

console.log(`done: ${DEST}`);
