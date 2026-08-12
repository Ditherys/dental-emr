import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.{mjs,ts}"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
