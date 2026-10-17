/** `npm run lodestone:measure -- [--base http://localhost:3010] [--email you@x.edu] [--runs 5] [--save dir]`
 *
 * Median time to first byte, and to the last byte, for each Lodestone route
 * against a running dev server, warm: every route is fetched once and thrown
 * away before the timed runs. Signs in through the development bypass as
 * `--email` (or sends `LODESTONE_COOKIE` as is). When the server was started
 * with `LODESTONE_SQL_LOG=1`, each request's statements are counted from
 * `data/sql.log`, which the server appends to; requests run one at a time so
 * the lines between two reads are that request's. Nothing else should be
 * talking to the server while this runs. `--save` writes each route's
 * `<main>`, scripts stripped, to a file in that directory: diff two runs to
 * show a change left the pages as they were. */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  return at === -1 ? null : args[at + 1] ?? null;
};
const base = (flag("--base") ?? "http://localhost:3010").replace(/\/$/, "");
const runs = Number(flag("--runs") ?? 5);
const email = flag("--email") ?? process.env.LODESTONE_MEASURE_EMAIL ?? null;
const save = flag("--save");
const LOG = path.join(process.cwd(), "data", "sql.log");

/** Follow the dev bypass by hand, keeping every cookie it sets. */
async function signIn(address: string): Promise<string> {
  const jar = new Map<string, string>();
  let url = `${base}/api/auth/dev-login?email=${encodeURIComponent(address)}&next=/lodestone`;
  for (let hop = 0; hop < 5; hop++) {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(url, { redirect: "manual", headers: cookie ? { cookie } : {} });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const at = pair.indexOf("=");
      jar.set(pair.slice(0, at), pair.slice(at + 1));
    }
    const next = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !next) break;
    url = new URL(next, url).toString();
    if (new URL(url).pathname.startsWith("/lodestone")) break;
  }
  if (![...jar.keys()].some((k) => k.includes("session_token"))) throw new Error(`Sign-in as ${address} set no session cookie. Is the dev server up at ${base}?`);
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

const logSize = () => (existsSync(LOG) ? statSync(LOG).size : 0);
function linesSince(offset: number): string[] {
  if (!existsSync(LOG)) return [];
  return readFileSync(LOG).subarray(offset).toString("utf8").split("\n").filter(Boolean);
}

async function hit(route: string, cookie: string) {
  const offset = logSize();
  const start = performance.now();
  const res = await fetch(`${base}${route}`, { redirect: "manual", headers: { cookie } });
  const ttfb = performance.now() - start;
  const body = await res.text();
  const total = performance.now() - start;
  // The logger appends synchronously, but give a straggler a moment.
  await new Promise((r) => setTimeout(r, 30));
  const statements = linesSince(offset);
  return { status: res.status, ttfb, total, body, statements };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const cookie = process.env.LODESTONE_COOKIE ?? (email ? await signIn(email) : "");
if (!cookie) console.log("No --email or LODESTONE_COOKIE: measuring signed out.");

const routes = ["/", "/login", "/lodestone", "/lodestone/digest", "/lodestone/map", "/lodestone/tokens"];
// The first card the home page links to, for the card page and its field.
const home = await hit("/lodestone", cookie);
const card = /href="(\/lodestone\/cards\/[0-9a-f-]{32,36})"/.exec(home.body)?.[1];
if (card) routes.push(card, `${card}/field`);

const logging = existsSync(LOG);
const rows: string[] = [];
for (const route of routes) {
  await hit(route, cookie);
  const samples = [];
  for (let i = 0; i < runs; i++) samples.push(await hit(route, cookie));
  const label = route.replace(/[0-9a-f-]{32,36}/, "[ideaId]");
  if (save) {
    mkdirSync(save, { recursive: true });
    const main = /<main[\s\S]*<\/main>/.exec(samples[0].body)?.[0] ?? samples[0].body;
    writeFileSync(path.join(save, `${label.replace(/[^a-z0-9]+/gi, "_") || "root"}.html`), main.replace(/<script[\s\S]*?<\/script>/g, "").replace(/></g, ">\n<"));
  }
  const statements = samples.map((s) => s.statements.length);
  const writes = samples.map((s) => s.statements.filter((q) => /\t(insert|update|delete)\b/i.test(q)).length);
  rows.push(`| \`${label}\` | ${samples[0].status} | ${Math.round(median(samples.map((s) => s.ttfb)))} | ${Math.round(median(samples.map((s) => s.total)))} | ${logging ? median(statements) : "–"} | ${logging ? median(writes) : "–"} |`);
}

console.log(`\n${base}, ${runs} warm runs each, medians, ${new Date().toISOString().slice(0, 10)}${logging ? "" : " (no data/sql.log: start the server with LODESTONE_SQL_LOG=1 to count statements)"}\n`);
console.log("| Route | Status | TTFB ms | Total ms | Statements | Writes |");
console.log("| --- | --- | --- | --- | --- | --- |");
for (const r of rows) console.log(r);
