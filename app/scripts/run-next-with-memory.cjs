const { spawn } = require("child_process");

const [command, ...args] = process.argv.slice(2);

if (!command) {
    console.error("Usage: node scripts/run-next-with-memory.cjs <dev|build|start> [...args]");
    process.exit(1);
}

const defaultHeapByCommandMb = {
    dev: "3072",
    build: "4096",
    start: "2048",
};

const heapMb =
    process.env.NODE_MAX_OLD_SPACE_SIZE ||
    defaultHeapByCommandMb[command] ||
    defaultHeapByCommandMb.build;

const nextBin = require.resolve("next/dist/bin/next");
const existingNodeOptions = process.env.NODE_OPTIONS?.trim();
const nodeOptions = [
    existingNodeOptions,
    `--max-old-space-size=${heapMb}`,
].filter(Boolean);

const child = spawn(process.execPath, [nextBin, command, ...args], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
        ...process.env,
        NODE_OPTIONS: nodeOptions.join(" "),
    },
});

child.on("exit", (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }

    process.exit(code ?? 1);
});
