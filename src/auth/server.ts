import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { magicLink } from "better-auth/plugins";
import { getDb, type Db } from "@/db/client";
import { authAccount, authSession, authUser, authVerification } from "@/db/auth-schema";
import { deliverAuthLink, type AuthLinkDelivery } from "./delivery";

export function createAuth(db: Db, options: { secret?: string; baseURL?: string; sendMagicLink?: AuthLinkDelivery } = {}) {
  const globals = globalThis as typeof globalThis & { __forgeAuthSecret?: string };
  const production = process.env.NODE_ENV === "production";
  const secret = options.secret ?? (process.env.BETTER_AUTH_SECRET || (production ? undefined : (globals.__forgeAuthSecret ??= randomBytes(48).toString("hex"))));
  const baseURL = options.baseURL ?? (process.env.BETTER_AUTH_URL || (production ? undefined : "http://localhost:3000"));
  if (!secret || !baseURL) throw new Error("BETTER_AUTH_SECRET and BETTER_AUTH_URL are required in production.");
  return betterAuth({
    appName: "Thesis Forge", baseURL, secret,
    database: drizzleAdapter(db, { provider: "pg", schema: { user: authUser, session: authSession, account: authAccount, verification: authVerification } }),
    session: { expiresIn: 60 * 60 * 24 * 7, cookieCache: { enabled: false } },
    plugins: [magicLink({ expiresIn: 600, storeToken: "hashed", sendMagicLink: options.sendMagicLink ?? deliverAuthLink })],
  });
}

export async function getAuth() {
  const db = await getDb();
  const globals = globalThis as typeof globalThis & { __forgeAuth?: { db: Db; auth: ReturnType<typeof createAuth> } };
  if (globals.__forgeAuth?.db === db) return globals.__forgeAuth.auth;
  const auth = createAuth(db);
  globals.__forgeAuth = { db, auth };
  return auth;
}
