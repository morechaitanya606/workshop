const {
    copyFileSync,
    mkdtempSync,
    readFileSync,
    renameSync,
    rmSync,
    unlinkSync,
    writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const supabasePackage = require("supabase/package.json");

const outputPath = join(process.cwd(), "src", "lib", "database.types.ts");
const tempDir = mkdtempSync(join(tmpdir(), "onlyworkshop-supabase-types-"));
const tempPath = join(tempDir, "database.types.ts");
const supabaseBin = require.resolve("supabase/dist/supabase.js");
const projectId = process.env.SUPABASE_PROJECT_ID?.trim();
const sourceArgs = projectId ? ["--project-id", projectId] : ["--linked"];

function replaceFile(source, destination) {
    try {
        renameSync(source, destination);
    } catch (error) {
        if (error?.code !== "EXDEV") {
            throw error;
        }

        copyFileSync(source, destination);
        unlinkSync(source);
    }
}

if (supabasePackage.version !== "2.105.0") {
    process.stderr.write(
        `Expected supabase CLI 2.105.0, found ${supabasePackage.version}. Run npm install before regenerating types.\n`
    );
    process.exit(1);
}

const args = [
    "gen",
    "types",
    "typescript",
    "--schema",
    "public",
    ...sourceArgs,
];

try {
    const result = spawnSync(process.execPath, [supabaseBin, ...args], {
        cwd: process.cwd(),
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
    });

    if (result.stdout) {
        writeFileSync(tempPath, result.stdout);
    }

    if (result.status !== 0) {
        if (result.stdout) process.stdout.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);
        process.stderr.write(
            "\nSupabase type generation failed; src/lib/database.types.ts was left unchanged.\n"
        );
        process.exit(result.status ?? 1);
    }

    const generated = readFileSync(tempPath, "utf8");
    if (!generated.includes("export type Json") || !generated.includes("export type Database")) {
        process.stderr.write(
            "Supabase type generation did not produce the expected TypeScript output; src/lib/database.types.ts was left unchanged.\n"
        );
        process.exit(1);
    }

    replaceFile(tempPath, outputPath);
    process.stdout.write(`Generated Supabase types at ${outputPath}\n`);
} finally {
    rmSync(tempDir, { recursive: true, force: true });
}
