import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname)
    }
  },
  test: {
    env: {
      // The test environment is not "development", so the auth layer now
      // requires a real secret (matching production/preview behavior).
      AUTH_SECRET: "test-suite-auth-secret-value-1234567890"
    }
  }
});
