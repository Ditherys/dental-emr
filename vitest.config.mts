import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // The real package throws outside a React Server Component context and
      // is not installable as a browser dependency; Next's own build enforces
      // the server/client boundary, so unit tests only need it to resolve.
      "server-only": fileURLToPath(
        new URL("./src/test/server-only-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.{mjs,ts}"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
