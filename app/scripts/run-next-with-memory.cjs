const { spawn } = require("child_process");
const os = require("os");

const [command, ...args] = process.argv.slice(2);

if (!command) {
    console.error("Usage: node scripts/run-next-with-memory.cjs <dev|build|start> [...args]");
    process.exit(1);
}

const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);

if (Number.isFinite(nodeMajor) && nodeMajor >= 24) {
    console.error(
        [
            `Detected Node.js ${process.versions.node}.`,
            "This staged upgrade supports Next.js 15 on Node 18.18 through Node 23.",
            "Node 24 is intentionally deferred for this project stage.",
        ].join(" ")
    );
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

const nextVersion = require("next/package.json").version;
const startedAt = Date.now();
const outputTailLimit = 16 * 1024;
const heartbeatIntervalMs = Number.parseInt(
    process.env.NEXT_WRAPPER_HEARTBEAT_INTERVAL_MS || "30000",
    10
);
const heartbeatCommands = (process.env.NEXT_WRAPPER_HEARTBEAT_COMMANDS || "build")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
const childTimeoutMs = Number.parseInt(process.env.NEXT_WRAPPER_TIMEOUT_MS || "0", 10);
const heartbeatEnabled =
    Number.isFinite(heartbeatIntervalMs) &&
    heartbeatIntervalMs > 0 &&
    heartbeatCommands.includes(command);
const timeoutEnabled = Number.isFinite(childTimeoutMs) && childTimeoutMs > 0;
let stdoutTail = "";
let stderrTail = "";
let stdoutBytes = 0;
let stderrBytes = 0;
let childStartError = null;
let lastOutputAt = Date.now();
let heartbeatTimer = null;
let timeoutTimer = null;

function appendTail(current, chunk) {
    const next = current + chunk.toString();
    if (next.length <= outputTailLimit) {
        return next;
    }

    return next.slice(next.length - outputTailLimit);
}

function printDiagnostics(reason, code, signal) {
    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

    console.error("");
    console.error("[next-wrapper] Diagnostic summary");
    console.error(`[next-wrapper] Reason: ${reason}`);
    console.error(`[next-wrapper] Command: next ${[command, ...args].join(" ")}`.trim());
    console.error(`[next-wrapper] CWD: ${process.cwd()}`);
    console.error(`[next-wrapper] Node.js: ${process.versions.node}`);
    console.error(`[next-wrapper] Next.js: ${nextVersion}`);
    console.error(`[next-wrapper] Heap MB: ${heapMb}`);
    console.error(`[next-wrapper] NODE_OPTIONS: ${nodeOptions.join(" ") || "(none)"}`);
    console.error(`[next-wrapper] Elapsed: ${elapsedSeconds}s`);
    console.error(`[next-wrapper] Exit code: ${code ?? "(none)"}`);
    console.error(`[next-wrapper] Signal: ${signal ?? "(none)"}`);
    console.error(`[next-wrapper] stdout bytes: ${stdoutBytes}`);
    console.error(`[next-wrapper] stderr bytes: ${stderrBytes}`);
    console.error(`[next-wrapper] free system memory MB: ${Math.round(os.freemem() / 1024 / 1024)}`);

    if (childStartError) {
        console.error(`[next-wrapper] Spawn error: ${childStartError.stack || childStartError}`);
    }

    if (stdoutTail.trim()) {
        console.error("[next-wrapper] stdout tail:");
        console.error(stdoutTail);
    }

    if (stderrTail.trim()) {
        console.error("[next-wrapper] stderr tail:");
        console.error(stderrTail);
    }
}

function printHeartbeat() {
    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    const quietSeconds = ((Date.now() - lastOutputAt) / 1000).toFixed(1);
    const memoryUsage = process.memoryUsage();

    console.error(
        [
            `[next-wrapper] next ${command} still running`,
            `elapsed=${elapsedSeconds}s`,
            `quiet=${quietSeconds}s`,
            `wrapper-rss=${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
            `free-system=${Math.round(os.freemem() / 1024 / 1024)}MB`,
        ].join(" ")
    );
}

function getStartPortFromArgs() {
    if (command !== "start") {
        return null;
    }

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if ((arg === "-p" || arg === "--port") && args[index + 1]) {
            return args[index + 1];
        }

        if (arg.startsWith("--port=")) {
            return arg.slice("--port=".length);
        }
    }

    return null;
}

const inferredPort = process.env.PORT || getStartPortFromArgs();

console.error(
    `[next-wrapper] Running next ${[command, ...args].join(" ")} with Node ${process.versions.node}, Next ${nextVersion}, heap ${heapMb} MB`
);

const child = spawn(process.execPath, [nextBin, command, ...args], {
    cwd: process.cwd(),
    stdio: ["inherit", "pipe", "pipe"],
    env: {
        ...process.env,
        ...(inferredPort ? { PORT: inferredPort } : {}),
        NODE_OPTIONS: nodeOptions.join(" "),
    },
});

if (heartbeatEnabled) {
    heartbeatTimer = setInterval(printHeartbeat, heartbeatIntervalMs);
}

if (timeoutEnabled) {
    timeoutTimer = setTimeout(() => {
        printDiagnostics("child exceeded NEXT_WRAPPER_TIMEOUT_MS", null, null);
        child.kill("SIGTERM");
    }, childTimeoutMs);
}

child.stdout.on("data", (chunk) => {
    lastOutputAt = Date.now();
    stdoutBytes += chunk.length;
    stdoutTail = appendTail(stdoutTail, chunk);
    process.stdout.write(chunk);
});

child.stderr.on("data", (chunk) => {
    lastOutputAt = Date.now();
    stderrBytes += chunk.length;
    stderrTail = appendTail(stderrTail, chunk);
    process.stderr.write(chunk);
});

child.on("error", (error) => {
    childStartError = error;
});

child.on("close", (code, signal) => {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
    }

    if (timeoutTimer) {
        clearTimeout(timeoutTimer);
    }

    if (signal) {
        printDiagnostics("child terminated by signal", code, signal);
        process.exit(1);
        return;
    }

    if (code && code !== 0) {
        printDiagnostics("child exited with non-zero code", code, signal);
    } else if (stdoutBytes === 0 && stderrBytes === 0) {
        printDiagnostics("child completed without output", code, signal);
    }

    process.exit(code ?? 1);
});
