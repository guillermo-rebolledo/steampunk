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
    // Match .tsx too. A `.test.tsx` file under a `.ts`-only glob is skipped
    // silently — the suite still reports green, so the gap is invisible.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
