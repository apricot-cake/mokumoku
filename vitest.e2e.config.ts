import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["e2e/**/*.e2e.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    retry: 0,
    expect: { poll: { timeout: 5000 } },
    testTimeout: 30000,
    hookTimeout: 30000,
    reporters: ["default", "json"],
    outputFile: { json: ".output/e2e-results/result.json" },
  },
});
