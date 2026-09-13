import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
    esbuild: {
        jsx: "automatic",
        jsxImportSource: "react",
    },
    test: {
        environment: "jsdom",
        fileParallelism: false,
        globals: false,
        maxWorkers: 1,
        mockReset: true,
        pool: "forks",
        restoreMocks: true,
        setupFiles: [],
    },
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
            // See src/test/server-only-stub.ts: the real package throws outside a
            // react-server bundle, which would break every suite that reaches a
            // server-guarded module.
            "server-only": fileURLToPath(
                new URL("./src/test/server-only-stub.ts", import.meta.url)
            ),
        },
    },
});
