import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["e2e/**/*.live.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    retry: 0,
    expect: { poll: { timeout: 10000 } },
    testTimeout: 45000,
    hookTimeout: 45000,
    reporters: ["default", "json"],
    outputFile: { json: ".output/live-results/result.json" },
  },
});
