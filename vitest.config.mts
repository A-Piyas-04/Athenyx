import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["tests/setup/test-db.ts"],
    // DB-backed tests share one test database; run files one at a time.
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/fixtures/**", "node_modules/**"],
  },
});
