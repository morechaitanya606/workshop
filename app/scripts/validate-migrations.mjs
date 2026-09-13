/**
 * Parse every migration with Postgres's own grammar before it can reach a database.
 *
 * Run from app/:  npm run db:validate
 *
 * The September 2026 audit's recurring theme was migrations reaching production unverified:
 * CI has no database, so a file with a plain syntax error stayed green all the way to
 * `supabase db push`, where it fails partway through a transaction against live data. This
 * uses libpg_query -- the real Postgres parser, compiled to WASM -- so the check needs no
 * server and runs in CI.
 *
 * It validates SYNTAX, not semantics. A statement can parse perfectly and still fail against
 * real data: a unique index on a column that already holds duplicates, say. This catches the
 * class of mistake that should never have reached a deploy, not every one.
 *
 * Each file is parsed in its own child process. The WASM build corrupts its own heap after
 * several files and aborts the runtime outright (not a catchable throw), so one shared
 * process turns an unrelated file into a failure of the whole gate. Per-file isolation also
 * means a parser fault can be reported against the file that caused it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "..", "supabase", "migrations");
const SELF = fileURLToPath(import.meta.url);

/** Child mode: parse exactly one file and report on stdout. */
async function validateOne(file) {
    const { default: initPgQuery } = await import("pg-query-emscripten");
    const pgQuery = await initPgQuery();
    const sql = readFileSync(file, "utf8");

    const parsed = pgQuery.parse(sql);
    if (parsed.error) {
        const line = sql.slice(0, parsed.error.cursorpos).split("\n").length;
        console.log(`FAIL ${parsed.error.message} (line ${line})`);
        process.exit(1);
    }

    const statements = parsed.parse_tree?.stmts?.length ?? 0;

    // plpgsql bodies live inside `$$ ... $$` literals, so the SQL grammar never looks inside
    // them. Parse them separately or every function body ships unchecked.
    const plpgsql = pgQuery.parsePlpgsql(sql);
    if (plpgsql.error) {
        console.log(`FAIL plpgsql: ${plpgsql.error.message}`);
        process.exit(1);
    }

    const bodies = Array.isArray(plpgsql.plpgsql_funcs) ? plpgsql.plpgsql_funcs.length : 0;
    console.log(`OK ${statements} ${bodies}`);
    process.exit(0);
}

const childFile = process.argv[2];
if (childFile) {
    await validateOne(childFile);
} else {
    const files = readdirSync(MIGRATIONS_DIR)
        .filter((name) => name.endsWith(".sql"))
        .sort();

    if (files.length === 0) {
        console.error(`No .sql files found in ${MIGRATIONS_DIR}`);
        process.exit(1);
    }

    let failed = 0;

    for (const name of files) {
        const result = spawnSync(process.execPath, [SELF, join(MIGRATIONS_DIR, name)], {
            encoding: "utf8",
        });
        const output = `${result.stdout || ""}`.trim();

        if (result.status === 0 && output.startsWith("OK")) {
            const [, statements, bodies] = output.split(/\s+/);
            console.log(`ok   ${name}  (${statements} stmts, ${bodies} plpgsql bodies)`);
            continue;
        }

        failed += 1;
        const detail = output.replace(/^FAIL\s*/, "") || `parser exited ${result.status}`;
        console.error(`FAIL ${name}\n     ${detail}`);
    }

    console.log(
        failed
            ? `\n${failed} of ${files.length} migration(s) failed to parse.`
            : `\nAll ${files.length} migrations parse.`
    );

    process.exit(failed ? 1 : 0);
}
