const seenWarnings = new Set<string>();

export function warnDevFallback(scope: string, message: string) {
    if (process.env.NODE_ENV === "production") {
        return;
    }

    const key = `${scope}:${message}`;
    if (seenWarnings.has(key)) {
        return;
    }

    seenWarnings.add(key);
    console.warn(`[dev-fallback:${scope}] ${message}`);
}
