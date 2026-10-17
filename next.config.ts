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
  // The app is the network. Answered before any layout renders, so the bare
  // origin costs no session read.
  redirects: async () => [{ source: "/", destination: "/lodestone", permanent: false }],
};

export default nextConfig;
