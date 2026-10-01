/** Shared by the proxy (no DB, edge-safe) and the server (DB). */
export const SESSION_COOKIE = "tf_session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSessionId(value: string | undefined): value is string {
  return typeof value === "string" && UUID.test(value);
}
