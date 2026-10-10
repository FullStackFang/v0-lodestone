type Environment = Record<string, string | undefined>;

export type ProductionConfig = {
  databaseUrl: string;
  authOrigin: string;
  authSecret: string;
  /** Null when no mail provider is configured: the magic-link form is hidden
   *  and the digest cron skips delivery. Google sign-in must then be on. */
  emailFrom: string | null;
  resendApiKey: string | null;
  googleSignIn: boolean;
  operatorEmails: string[];
};

function required(env: Environment, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required for production.`);
  return value;
}

export function productionConfig(env: Environment = process.env): ProductionConfig {
  const databaseUrl = required(env, "DATABASE_URL");
  let database: URL;
  try {
    database = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a Postgres connection URL.");
  }
  if (database.protocol !== "postgres:" && database.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use persistent Postgres storage.");
  }

  const authOrigin = required(env, "BETTER_AUTH_URL");
  let origin: URL;
  try {
    origin = new URL(authOrigin);
  } catch {
    throw new Error("BETTER_AUTH_URL must be a valid HTTPS origin.");
  }
  if (origin.protocol !== "https:" || origin.origin !== authOrigin.replace(/\/$/, "")) {
    throw new Error("BETTER_AUTH_URL must be a stable HTTPS origin without a path.");
  }

  const authSecret = required(env, "BETTER_AUTH_SECRET");
  if (authSecret.length < 32) throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");

  const emailFrom = env.AUTH_EMAIL_FROM?.trim() || null;
  const resendApiKey = env.RESEND_API_KEY?.trim() || null;
  if ((emailFrom === null) !== (resendApiKey === null)) {
    throw new Error("Email delivery needs both AUTH_EMAIL_FROM and RESEND_API_KEY, or neither.");
  }
  const googleSignIn = Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim());
  if (!googleSignIn && !resendApiKey) {
    throw new Error("Production needs a sign-in method: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or email delivery.");
  }

  const operatorEmails = required(env, "PILOT_OPERATOR_EMAILS")
    .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (!operatorEmails.length || operatorEmails.some((email) => !email.includes("@"))) {
    throw new Error("PILOT_OPERATOR_EMAILS must contain at least one valid operator email.");
  }
  return { databaseUrl, authOrigin: origin.origin, authSecret, emailFrom, resendApiKey, googleSignIn, operatorEmails };
}
