import { parseArgs } from "node:util";
import { rehearsePilot } from "./rehearsal.mts";

try {
  const { values } = parseArgs({ options: { help: { type: "boolean" } }, strict: true, allowPositionals: false });
  if (values.help) {
    console.log("npm run pilot:rehearse\nRequires Node 22.16+ and local Docker. Creates disposable PostgreSQL 16/pgvector, verifies the release and backup/restore, then removes its container and volumes. Uses synthetic configuration; accepts no database URL or deployment target.");
  } else {
    await rehearsePilot();
  }
} catch (error) {
  const code = (error as { code?: string })?.code;
  console.error(code?.startsWith("ERR_PARSE_ARGS")
    ? "Invalid rehearsal arguments. Use npm run pilot:rehearse -- --help; no database URL or target is accepted."
    : error instanceof Error ? error.message : "Pilot rehearsal failed.");
  process.exitCode = 1;
}
