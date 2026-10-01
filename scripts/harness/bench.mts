/** `npm run bench -- <name> [args]`.
 *
 * The registry is the contract's; the implementations are the tracks'. A
 * registered name with no implementation yet prints `not implemented` and
 * exits 2, which is distinguishable from a typo (exit 1) by a script and by
 * a reader. */
import { BENCHES, isBenchName, loadBench } from "../../src/harness/bench/registry";

const [name, ...args] = process.argv.slice(2);

if (!name) {
  console.error(`usage: npm run bench -- <name> [args]\nregistered: ${BENCHES.join(", ")}`);
  process.exit(1);
}

if (!isBenchName(name)) {
  console.error(`unknown bench ${name}\nregistered: ${BENCHES.join(", ")}`);
  process.exit(1);
}

const bench = await loadBench(name);
if (!bench) {
  console.log(`${name}: not implemented`);
  process.exit(2);
}

await bench({ args });
// PGlite holds the event loop open on its data directory; a bench that has
// printed its result is done.
process.exit(0);
