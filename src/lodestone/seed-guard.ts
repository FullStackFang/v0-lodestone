/** The seed writes a synthetic cohort. It refuses production, and any
 *  `DATABASE_URL` whose host is not this machine: a production URL left in a
 *  local shell is the case this guards. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Why the seed must not run with this environment, or null when it may. */
export function seedRefusal(env: Record<string, string | undefined> = process.env): string | null {
  if (env.NODE_ENV === "production") return "The seed is a synthetic cohort and never runs with NODE_ENV=production.";
  const url = env.DATABASE_URL?.trim();
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return "DATABASE_URL is not a URL; the seed only writes to a local database.";
  }
  return LOCAL_HOSTS.has(host) ? null : `DATABASE_URL names ${host}; the seed only writes to a local database.`;
}
