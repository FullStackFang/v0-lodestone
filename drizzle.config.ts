import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  // Only `migrate`/`push` need a URL; `generate` is offline.
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://unused" },
});
