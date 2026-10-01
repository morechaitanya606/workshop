/**
 * Minimal PostgREST stand-in for route tests.
 *
 * `from(table)` pops the next queued result for that table. Every chained call
 * (`select`, `eq`, `update`, ...) is recorded and returns the same builder; awaiting the
 * builder, or calling `.single()` / `.maybeSingle()`, resolves to the queued result. An
 * empty queue resolves to `{ data: null, error: null }`.
 */
export type RecordedCall = { op: string; args: unknown[] };

export type QueuedResult = { data?: unknown; error?: unknown; count?: number | null };

export function createChainableSupabase(results: Record<string, QueuedResult[]> = {}) {
    const log: Array<{ table: string; calls: RecordedCall[] }> = [];

    const client = {
        from(table: string) {
            const entry = { table, calls: [] as RecordedCall[] };
            log.push(entry);
            const result = (results[table] || []).shift() ?? { data: null, error: null };

            const builder: any = new Proxy(
                {},
                {
                    get(_target, prop: string) {
                        if (prop === "then") {
                            return (resolve: (value: unknown) => void) => resolve(result);
                        }
                        return (...args: unknown[]) => {
                            entry.calls.push({ op: prop, args });
                            if (prop === "maybeSingle" || prop === "single") {
                                return Promise.resolve(result);
                            }
                            return builder;
                        };
                    },
                }
            );

            return builder;
        },
    };

    return {
        client,
        log,
        callsFor(table: string) {
            return log.filter((entry) => entry.table === table).flatMap((entry) => entry.calls);
        },
        tables() {
            return log.map((entry) => entry.table);
        },
    };
}
