import path from "path";
import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "jsdom",
        setupFiles: ["./src/test/setup.ts"],
        testTimeout: 15000,
        include: ["src/**/*.test.{ts,tsx}"],
        exclude: [...configDefaults.exclude, "e2e/**"],
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            "server-only": path.resolve(__dirname, "./src/test/server-only.ts"),
        },
    },
});
