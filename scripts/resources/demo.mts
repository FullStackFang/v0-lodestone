/** Loopback-only evaluation launcher. Never part of the production request handler. */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import next from "next";
import { getDb } from "../../src/db/client";
import { ensurePerson } from "../../src/harness/ledger";
import { enrollTestMember } from "../../src/pilot/test-fixtures";
import { importResource } from "../../src/resources/service";
import { createAuth } from "../../src/auth/server";

if (process.env.NODE_ENV === "production") throw new Error("The research demo runs locally in development only.");
process.chdir(path.resolve(import.meta.dirname, "../.."));
const origin = "http://localhost:3012";
const email = "research-demo@fixture.invalid";
Object.assign(process.env, { NODE_ENV: "development" });
// Empty values also prevent Next's later .env loading from restoring live services.
process.env.DATABASE_URL = "";
process.env.RESEND_API_KEY = "";
process.env.AUTH_EMAIL_FROM = "";
process.env.THESIS_DATA_DIR = "data/research-mvp";
process.env.THESIS_RESEARCH_DEMO = "1";
process.env.BETTER_AUTH_URL = origin;
process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("hex");
process.env.RESOURCE_CURATOR_EMAILS = email;
process.env.PILOT_OPERATOR_EMAILS = "";

const db = await getDb();
const owner = await ensurePerson(db, { name: "Research demo (test account)", email });
await enrollTestMember(db, owner);
const sample = JSON.parse(await readFile(new URL("./social-sample.json", import.meta.url), "utf8"));
for (const resource of sample) await importResource(db, owner, resource);

const app = next({ dev: true, hostname: "localhost", port: 3012 });
await app.prepare();
const handle = app.getRequestHandler();
const server = createServer(async (request, response) => {
  try {
    if (request.url === "/demo" && request.method === "GET") {
      if (request.headers.host !== "localhost:3012") { response.writeHead(403).end(); return; }
      let signInUrl = "";
      const auth = createAuth(db, { sendMagicLink: async ({ url }) => { signInUrl = url; } });
      await auth.api.signInMagicLink({ headers: new Headers({ origin }), body: { email, name: "Research demo (test account)", callbackURL: "/new?example=social" } });
      if (!signInUrl) throw new Error("Demo sign-in failed.");
      response.writeHead(302, { location: signInUrl, "cache-control": "no-store" }).end();
      return;
    }
    await handle(request, response);
  } catch {
    if (!response.headersSent) response.writeHead(500, { "content-type": "text/plain" });
    response.end("The local demo request failed. Restart the demo to try again.");
  }
});
server.listen(3012, "127.0.0.1", () => {
  console.log(`Research demo: ${origin}/demo`);
  console.log("Three real-paper excerpt records; synthetic account; local data/research-mvp only; no outgoing email.");
});
