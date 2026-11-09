import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // tsconfig keeps JSX for Next; tests that import a component (the nav list) need it compiled.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: { "@": path.resolve(process.cwd(), "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
