import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./__tests__/setup.ts"],
    include: ["__tests__/**/*.test.{ts,tsx}"],
    testTimeout: 15000,
    fileParallelism: false,
    globalSetup: ["./__tests__/global-setup.ts"],
    // Workers are separate processes from globalSetup; this is the
    // guaranteed channel for pointing them at the test database.
    env: { DATABASE_PATH: ".vitest/iris.db" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
