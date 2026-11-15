import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/attention-guard/**/*.test.ts", "src/calendarEvents.test.ts"],
    clearMocks: true,
  },
});
