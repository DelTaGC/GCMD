/**
 * `npm run bench`: runs the timing files in tests/perf/ (excluded from the
 * normal test run by their `.perf.ts` suffix). See docs/perf.md.
 */
import { defineConfig } from "vitest/config";
import base from "./vite.config.ts";

export default defineConfig((env) => {
  const config = base(env);
  return {
    ...config,
    test: {
      ...config.test,
      include: ["tests/perf/**/*.perf.ts"],
      testTimeout: 120_000,
      fileParallelism: false,
    },
  };
});
