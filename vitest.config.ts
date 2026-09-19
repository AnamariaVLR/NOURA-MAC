import { defineConfig } from "vitest/config";
import path from "node:path";

// Some modules under test pull in the Prisma client at import time, which refuses
// to construct without DATABASE_URL. Vitest does not read .env on its own.
try {
  process.loadEnvFile(".env");
} catch {
  process.env.DATABASE_URL ??= "file:./dev.db";
}

export default defineConfig({
  test: {
    environment: "node",
    // Playwright specs live in tests/e2e and are run by `npm run test:e2e`.
    include: ["tests/unit/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
