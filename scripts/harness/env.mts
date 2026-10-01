/** Load `.env.local` into a script's environment.
 *
 * `next dev` reads `.env.local` for you; `tsx` and `vitest` do not, so every
 * harness script that wants a key had to be run with the variable exported by
 * hand. That is a footgun with a silent failure mode: without
 * `VOYAGE_API_KEY` nothing throws — assertions are written with null vectors
 * and the run records `embedded = false`, so the seed *looks* fine and the
 * bench refuses to score it an hour later.
 *
 * Imported first, before any module that reads `process.env` at load time.
 * `.env.local` is gitignored; this file only reads it.
 */
import { existsSync } from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), ".env.local");
if (existsSync(file)) process.loadEnvFile(file);
