const { spawn } = require("child_process");
const net = require("net");
const os = require("os");

const [command, ...args] = process.argv.slice(2);

if (!command) {
    console.error("Usage: node scripts/run-next-with-memory.cjs <dev|build|start> [...args]");
    process.exit(1);
}

const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);

if (Number.isFinite(nodeMajor) && nodeMajor >= 25) {
    console.error(
        [
            `Detected Node.js ${process.versions.node}.`,
            "This project supports Next.js 15 on Node 18.18 through Node 24.",
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
let stdoutAvailable = true;
let stderrAvailable = true;

function handleOutputError(streamName, error) {
    if (error?.code === "EPIPE") {
        if (streamName === "stdout") {
            stdoutAvailable = false;
        } else {
            stderrAvailable = false;
        }
        return;
    }

    throw error;
}

function forwardOutput(streamName, chunk) {
    if (streamName === "stdout") {
        if (!stdoutAvailable || process.stdout.destroyed) {
            return;
        }
        process.stdout.write(chunk);
        return;
    }

    if (!stderrAvailable || process.stderr.destroyed) {
        return;
    }
    process.stderr.write(chunk);
}

process.stdout.on("error", (error) => handleOutputError("stdout", error));
process.stderr.on("error", (error) => handleOutputError("stderr", error));

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

function getPortFromArgs() {
    if (command !== "dev" && command !== "start") {
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

function canListenOnPort(port) {
    return new Promise((resolve) => {
        const server = net.createServer();

        server.once("error", () => resolve(false));
        server.once("listening", () => {
            server.close(() => resolve(true));
        });
        server.listen(port, "127.0.0.1");
    });
}

async function findAvailablePort(startPort) {
    for (let offset = 0; offset < 20; offset += 1) {
        const port = startPort + offset;
        if (await canListenOnPort(port)) {
            return String(port);
        }
    }

    return String(startPort);
}

function hasPortArg() {
    return args.some((arg) => arg === "-p" || arg === "--port" || arg.startsWith("--port="));
}

async function resolveDevPort() {
    if (command !== "dev") {
        return null;
    }

    const explicitPort = getPortFromArgs() || process.env.PORT;
    if (explicitPort) {
        return explicitPort;
    }

    return findAvailablePort(3000);
}

async function main() {
    const devPort = await resolveDevPort();
    const startPort = command === "start" ? process.env.PORT || getPortFromArgs() : null;
    const inferredPort = devPort || startPort;
    const nextArgs = [...args];

    if (command === "dev" && devPort && !hasPortArg()) {
        nextArgs.push("--port", devPort);
    }

    const extraEnv = {
        ...(inferredPort ? { PORT: inferredPort } : {}),
        ...(devPort ? { NEXT_DEV_DIST_DIR: `.next-dev-${devPort}` } : {}),
    };

    console.error(
        `[next-wrapper] Running next ${[command, ...nextArgs].join(" ")} with Node ${process.versions.node}, Next ${nextVersion}, heap ${heapMb} MB${
            devPort ? `, dev dist ${extraEnv.NEXT_DEV_DIST_DIR}` : ""
        }`
    );

    const child = spawn(process.execPath, [nextBin, command, ...nextArgs], {
        cwd: process.cwd(),
        stdio: ["inherit", "pipe", "pipe"],
        env: {
            ...process.env,
            ...extraEnv,
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
        forwardOutput("stdout", chunk);
    });

    child.stderr.on("data", (chunk) => {
        lastOutputAt = Date.now();
        stderrBytes += chunk.length;
        stderrTail = appendTail(stderrTail, chunk);
        forwardOutput("stderr", chunk);
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
}

main().catch((error) => {
    childStartError = error;
    printDiagnostics("wrapper failed before starting next", null, null);
    process.exit(1);
});
