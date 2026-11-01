// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * What a visitor's browser downloads is decided by import statements: a "use client" module
 * bundles everything it imports, and a "use server" module is replaced by a reference. These
 * rules keep the libraries the slow-network work moved out of the first-load JavaScript (zod and
 * the server schema, supabase-js, Sentry) from creeping back in. Reading the imports needs no
 * build and takes milliseconds.
 */

const SRC = fileURLToPath(new URL("../", import.meta.url));
const SUFFIXES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

/** The layouts and boundaries every public page is wrapped in (first-load JavaScript). */
const ALWAYS_LOADED = [
    "app/layout.tsx",
    "app/template.tsx",
    "app/not-found.tsx",
    "app/error.tsx",
    "app/global-error.tsx",
    "app/(public)/layout.tsx",
];

/** Client modules that may import zod: the admin, host and community forms (route-level). */
const ZOD_IMPORTERS = ["lib/validators.ts"];

type Mode = "server" | "client";

interface SourceModule {
    isClient: boolean;
    isServerAction: boolean;
    staticImports: string[];
    dynamicImports: string[];
}

const posix = (path: string) => path.split(sep).join("/");
const shortName = (path: string) => posix(relative(SRC, path));
const absolute = (path: string) => join(SRC, path);

function collectSourceFiles(directory: string, files: string[] = []) {
    for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        if (statSync(path).isDirectory()) {
            collectSourceFiles(path, files);
        } else if (/\.tsx?$/.test(name) && !/\.(test|d)\.tsx?$/.test(name)) {
            files.push(path);
        }
    }
    return files;
}

function hasDirective(source: string, directive: string) {
    const code = source.replace(/^﻿/, "").replace(/^(?:\s+|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "");
    return code.startsWith(`"${directive}"`) || code.startsWith(`'${directive}'`);
}

function parseImports(source: string) {
    const code = source
        .split("\n")
        .filter((line) => !/^\s*(?:\*|\/\/|\/\*)/.test(line))
        .join("\n");
    const staticImports = new Set<string>();
    const dynamicImports = new Set<string>();

    // `import type ...` and `import { type A }` are erased by the compiler: no bundle edge.
    for (const match of code.matchAll(
        /^[ \t]*import\s+(?!type\s)([^;"']*?)\s+from\s*["']([^"']+)["']/gm
    )) {
        const specifiers = match[1].trim();
        const typesOnly =
            specifiers.startsWith("{") &&
            specifiers
                .replace(/[{}\s]/g, "")
                .split(",")
                .filter(Boolean)
                .every((name) => name.startsWith("type"));
        if (!typesOnly) staticImports.add(match[2]);
    }
    for (const match of code.matchAll(/^[ \t]*import\s*["']([^"']+)["']/gm)) {
        staticImports.add(match[1]);
    }
    for (const match of code.matchAll(
        /^[ \t]*export\s+(?!type\s)(?:\*|\{[^}]*\})(?:\s+as\s+\w+)?\s*from\s*["']([^"']+)["']/gm
    )) {
        staticImports.add(match[1]);
    }
    for (const match of code.matchAll(
        /\bimport\(\s*(?:\/\*[\s\S]*?\*\/\s*)?["']([^"']+)["']\s*\)/g
    )) {
        dynamicImports.add(match[1]);
    }

    return { staticImports: [...staticImports], dynamicImports: [...dynamicImports] };
}

function resolveLocalImport(from: string, specifier: string) {
    let base: string;
    if (specifier.startsWith("@/")) {
        base = join(SRC, specifier.slice(2));
    } else if (specifier.startsWith(".")) {
        base = resolve(dirname(from), specifier);
    } else {
        return null;
    }

    for (const suffix of SUFFIXES) {
        const candidate = base + suffix;
        if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
    return null;
}

const INSTRUMENTATION_CLIENT = absolute("instrumentation-client.ts");
const modules = new Map<string, SourceModule>();
for (const file of collectSourceFiles(SRC)) {
    const source = readFileSync(file, "utf8");
    modules.set(file, {
        isClient: hasDirective(source, "use client") || file === INSTRUMENTATION_CLIENT,
        isServerAction: hasDirective(source, "use server"),
        ...parseImports(source),
    });
}

const keyOf = (mode: Mode, file: string) => `${mode}:${file}`;

/**
 * Follows imports from the seeds. A server module's imports stay on the server until they reach a
 * "use client" module; from there everything imported is in the browser bundle. Returns each
 * visited module (by mode) with the module that pulled it in.
 */
function walkImports(
    seeds: ReadonlyArray<readonly [file: string, mode: Mode]>,
    includeDynamic: boolean
) {
    const parent = new Map<string, string | null>();
    const queue: Array<[string, Mode, string | null]> = seeds.map(([file, mode]) => [
        file,
        mode,
        null,
    ]);

    while (queue.length > 0) {
        const [file, requestedMode, from] = queue.shift()!;
        const info = modules.get(file);
        if (!info || info.isServerAction) continue;

        const mode: Mode = info.isClient ? "client" : requestedMode;
        const key = keyOf(mode, file);
        if (parent.has(key)) continue;
        parent.set(key, from);

        const specifiers = includeDynamic
            ? [...info.staticImports, ...info.dynamicImports]
            : info.staticImports;
        for (const specifier of specifiers) {
            const target = resolveLocalImport(file, specifier);
            if (target) queue.push([target, mode, key]);
        }
    }
    return parent;
}

function clientChain(parent: Map<string, string | null>, file: string) {
    const names: string[] = [];
    let key = parent.get(keyOf("client", file)) === undefined ? null : keyOf("client", file);
    while (key) {
        names.unshift(shortName(key.slice(key.indexOf(":") + 1)));
        key = parent.get(key) ?? null;
    }
    return names.join(" -> ");
}

function clientModulesWhere(
    parent: Map<string, string | null>,
    matches: (info: SourceModule, file: string) => boolean
) {
    const found: Array<{ name: string; chain: string }> = [];
    for (const key of parent.keys()) {
        if (!key.startsWith("client:")) continue;
        const file = key.slice("client:".length);
        if (matches(modules.get(file)!, file)) {
            found.push({ name: shortName(file), chain: clientChain(parent, file) });
        }
    }
    return found;
}

const importsPackage = (info: SourceModule, matches: (specifier: string) => boolean) =>
    info.staticImports.some(matches);
const isSentry = (specifier: string) => specifier.startsWith("@sentry/");
const isZod = (specifier: string) => specifier === "zod" || specifier.startsWith("zod/");
const isSupabasePackage = (specifier: string) => specifier.startsWith("@supabase/");

const everyClientModule = walkImports(
    [...modules].filter(([, info]) => info.isClient).map(([file]) => [file, "client"] as const),
    true
);
const alwaysLoaded = walkImports(
    ALWAYS_LOADED.map((path) => [absolute(path), "server"] as const),
    false
);

function describeAll(found: Array<{ name: string; chain: string }>) {
    return found.map((entry) => `${entry.name}  [${entry.chain}]`).join("\n");
}

describe("client bundle import graph", () => {
    it("sees the modules it is meant to police", () => {
        for (const path of ALWAYS_LOADED) {
            expect(modules.has(absolute(path)), path).toBe(true);
        }
        const everyClient = (path: string) =>
            everyClientModule.has(keyOf("client", absolute(path)));
        expect(everyClient("lib/auth-context.tsx")).toBe(true);
        expect(everyClient("lib/supabase.ts")).toBe(true); // through auth-context's dynamic import
        expect(everyClient("lib/public-env.ts")).toBe(true);
        expect(everyClient("instrumentation-client.ts")).toBe(true);
        expect(modules.get(absolute("app/(public)/(main)/past-events/actions.ts"))).toMatchObject({
            isServerAction: true,
        });
    });

    it("never bundles the server env (zod and the server schema) into the browser", () => {
        const found = clientModulesWhere(
            everyClientModule,
            (_, file) => file === absolute("lib/env.ts")
        );
        expect(found, describeAll(found)).toEqual([]);
    });

    it("never imports Sentry statically from client code", () => {
        const found = clientModulesWhere(everyClientModule, (info) =>
            importsPackage(info, isSentry)
        );
        expect(found, describeAll(found)).toEqual([]);
    });

    it("keeps zod to the form routes that validate with it", () => {
        const found = clientModulesWhere(everyClientModule, (info) => importsPackage(info, isZod));
        expect(
            found.map((entry) => entry.name),
            describeAll(found)
        ).toEqual(ZOD_IMPORTERS);
    });

    it("never imports lib/seo-topics.ts from client code", () => {
        const found = clientModulesWhere(
            everyClientModule,
            (_, file) => file === absolute("lib/seo-topics.ts")
        );
        expect(found, describeAll(found)).toEqual([]);
    });

    it("keeps supabase-js, zod, Sentry and PostHog out of the JavaScript every page loads", () => {
        const heavy = (info: SourceModule) =>
            importsPackage(
                info,
                (specifier) =>
                    isSupabasePackage(specifier) ||
                    isZod(specifier) ||
                    isSentry(specifier) ||
                    specifier === "posthog-js"
            );
        const found = [
            ...clientModulesWhere(alwaysLoaded, heavy),
            ...clientModulesWhere(alwaysLoaded, (_, file) =>
                ["lib/env.ts", "lib/supabase.ts", "lib/validators.ts"].some(
                    (path) => file === absolute(path)
                )
            ),
        ];
        expect(found, describeAll(found)).toEqual([]);
    });
});
