import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // `src/**` already covers `src/harness/**`; both are named because the
    // drift gate depends on every harness test — the contract's and both
    // tracks' fixtures — running on `npm test`.
    include: [
      "src/**/*.test.{ts,tsx}",
      "src/harness/**/*.test.ts",
      "evals/**/*.test.ts",
      "evals/harness/**/*.test.ts",
    ],
    environment: "node",
    // Bound concurrent WASM database startups on developer machines.
    maxWorkers: 2,
    testTimeout: 30_000,
    // Almost every suite opens a PGlite in `beforeAll`, and opening one now
    // applies two migrations including four HNSW index builds. Under a full
    // parallel run that passes vitest's 10s hook default; the work is real,
    // so the budget matches the tests'.
    hookTimeout: 30_000,
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
});
