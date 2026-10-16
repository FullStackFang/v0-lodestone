/** `npm run dev`: Lodestone's own port, with whatever held it killed first.
 *  3000 is everyone's port; this app lives on 3010 so a sibling checkout or
 *  another project on 3000 never collides with it, and a stale server from
 *  an earlier session never blocks a new one. Override with PORT. */
import { execSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const port = process.env.PORT || "3010";
const url = `http://localhost:${port}`;

/** Next refuses to start while `.next/dev/lock` names a live server for this
 *  directory, whatever port it took; that server goes too. */
function lockedPid() {
  try {
    const lock = JSON.parse(readFileSync(new URL("../.next/dev/lock", import.meta.url), "utf8"));
    return lock.pid ? String(lock.pid) : null;
  } catch {
    return null;
  }
}

function holders() {
  try {
    if (process.platform === "win32") {
      const out = execSync(`netstat -ano -p tcp`, { encoding: "utf8" });
      return [...new Set(out.split(/\r?\n/)
        .filter((l) => l.includes(`:${port} `) && /LISTENING/.test(l))
        .map((l) => l.trim().split(/\s+/).pop())
        .filter((pid) => pid && pid !== "0"))];
    }
    const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return out.split(/\s+/).filter(Boolean);
  } catch {
    return [];
  }
}

const stale = new Set([...holders(), lockedPid()].filter((pid) => pid && String(pid) !== String(process.pid)));
for (const pid of stale) {
  try {
    if (process.platform === "win32") execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    else process.kill(Number(pid), "SIGKILL");
    console.log(`dev: killed the previous dev server (PID ${pid})`);
  } catch {
    // Already gone, or not ours to kill; Next will say so if it still blocks.
  }
}

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["next", "dev", "-p", port],
  { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, PORT: port, BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || url } },
);
const stop = () => { if (!child.killed) child.kill(); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("exit", stop);
child.on("exit", (code) => process.exit(code ?? 0));
