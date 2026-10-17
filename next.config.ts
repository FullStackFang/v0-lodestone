import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the optional local research demo's compiler files away from an existing dev server.
  distDir: process.env.NODE_ENV !== "production" && process.env.THESIS_RESEARCH_DEMO === "1" ? ".next-research-mvp" : ".next",
  // This app lives inside a larger repo with its own lockfile; the app is the root.
  turbopack: { root: __dirname },
  // PGlite loads its WASM and extension bundles from the package on disk via
  // `new URL(..., import.meta.url)`; bundling rewrites those to static media
  // that does not exist. Same for postgres-js's optional native bits.
  serverExternalPackages: ["@electric-sql/pglite", "@electric-sql/pglite-pgvector", "postgres"],
  // Production always has DATABASE_URL (`src/pilot/config.ts`), so the PGlite
  // branch of `getDb` never runs there and its WASM is dead weight in every
  // function; `data/` and `evals/` are local and gitignored, excluded so a
  // local build traces what Vercel's would. A global exclude: a route that
  // ever needs PGlite in production must scope this to the other routes.
  // `*` matches every route (picomatch with `contains`).
  outputFileTracingExcludes: {
    "*": ["./node_modules/@electric-sql/pglite/**", "./node_modules/@electric-sql/pglite-pgvector/**", "./data/**", "./evals/**"],
  },
  // The app is the network. Answered before any layout renders, so the bare
  // origin costs no session read.
  redirects: async () => [{ source: "/", destination: "/lodestone", permanent: false }],
};

export default nextConfig;
