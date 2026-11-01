/**
 * A small STATEFUL stand-in for the Supabase client, for code that changes platform_settings with
 * compare-and-set writes (src/app/api/settings/platform-setting-cas.ts). Unlike
 * chainable-supabase.ts (queued answers) it holds the rows and applies the filters, so two
 * overlapping requests really can overwrite each other, or be refused the way the database
 * refuses them.
 *
 * Supported: platform_settings select / update / upsert (eq, is, select, maybeSingle, single) and
 * a workshops table that only knows ids (select("id").eq("id", x).maybeSingle()).
 */

export type FakeSettingRow = {
    setting_key: string;
    setting_value: unknown;
    updated_at: string | null;
};

type Filter = { kind: "eq" | "is"; column: string; value: unknown };

export type FakeWrite = {
    op: "update" | "upsert";
    payload: Record<string, unknown>;
    filters: Filter[];
    options?: Record<string, unknown>;
    /** Rows the write changed or inserted. */
    affected: number;
};

type FakeOptions = {
    settings?: FakeSettingRow[];
    /** Ids that exist in the workshops table. */
    workshops?: string[];
    /** Awaited before every platform_settings read resolves: lets a test interleave requests. */
    beforeSettingsRead?: () => Promise<void> | void;
    /** Runs just before a platform_settings write executes (another writer can get in first). */
    beforeSettingsWrite?: (write: Pick<FakeWrite, "op" | "payload" | "filters">) => void;
};

export function createFakeSettingsClient(options: FakeOptions = {}) {
    const rows = new Map<string, FakeSettingRow>(
        (options.settings ?? []).map((row) => [row.setting_key, { ...row }])
    );
    const workshops = new Set(options.workshops ?? []);
    const writes: FakeWrite[] = [];
    let nextWriteError: { message: string } | null = null;

    const matches = (row: FakeSettingRow, filters: Filter[]) =>
        filters.every((filter) => {
            const actual = (row as Record<string, unknown>)[filter.column];
            return filter.kind === "eq"
                ? actual === filter.value
                : (actual ?? null) === filter.value;
        });

    class Query implements PromiseLike<unknown> {
        private mode: "select" | "update" | "upsert" = "select";
        private payload: Record<string, unknown> = {};
        private upsertOptions: Record<string, unknown> | undefined;
        private filters: Filter[] = [];
        private returning = false;

        constructor(private readonly table: string) {}

        select() {
            if (this.mode !== "select") this.returning = true;
            return this;
        }
        update(payload: Record<string, unknown>) {
            this.mode = "update";
            this.payload = payload;
            return this;
        }
        upsert(payload: Record<string, unknown>, upsertOptions?: Record<string, unknown>) {
            this.mode = "upsert";
            this.payload = payload;
            this.upsertOptions = upsertOptions;
            return this;
        }
        eq(column: string, value: unknown) {
            this.filters.push({ kind: "eq", column, value });
            return this;
        }
        is(column: string, value: unknown) {
            this.filters.push({ kind: "is", column, value });
            return this;
        }
        maybeSingle() {
            return this.run(true);
        }
        single() {
            return this.run(true);
        }
        then<TResult1 = unknown, TResult2 = never>(
            onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ): PromiseLike<TResult1 | TResult2> {
            return this.run(false).then(onfulfilled, onrejected);
        }

        private async run(single: boolean): Promise<{ data: unknown; error: unknown }> {
            if (this.table === "workshops") {
                const id = this.filters.find((filter) => filter.column === "id")?.value;
                const row = typeof id === "string" && workshops.has(id) ? { id } : null;
                return { data: single ? row : row ? [row] : [], error: null };
            }
            if (this.table !== "platform_settings") {
                return { data: null, error: { message: `unknown table ${this.table}` } };
            }

            if (this.mode === "select") {
                await options.beforeSettingsRead?.();
                const row = [...rows.values()].find((candidate) =>
                    matches(candidate, this.filters)
                );
                const data = row
                    ? { setting_value: row.setting_value, updated_at: row.updated_at }
                    : null;
                return { data: single ? data : data ? [data] : [], error: null };
            }

            options.beforeSettingsWrite?.({
                op: this.mode,
                payload: this.payload,
                filters: this.filters,
            });
            const write: FakeWrite = {
                op: this.mode,
                payload: this.payload,
                filters: this.filters,
                options: this.upsertOptions,
                affected: 0,
            };
            writes.push(write);
            if (nextWriteError) {
                const error = nextWriteError;
                nextWriteError = null;
                return { data: null, error };
            }

            const touched: FakeSettingRow[] = [];
            if (this.mode === "update") {
                for (const row of rows.values()) {
                    if (!matches(row, this.filters)) continue;
                    Object.assign(row, this.payload);
                    touched.push(row);
                }
            } else {
                const key = String(this.payload.setting_key);
                const existing = rows.get(key);
                if (!existing) {
                    const row = { ...this.payload } as FakeSettingRow;
                    rows.set(key, row);
                    touched.push(row);
                } else if (!this.upsertOptions?.ignoreDuplicates) {
                    Object.assign(existing, this.payload);
                    touched.push(existing);
                }
            }
            write.affected = touched.length;
            return {
                data: this.returning
                    ? touched.map((row) => ({ setting_key: row.setting_key }))
                    : null,
                error: null,
            };
        }
    }

    return {
        client: { from: (table: string) => new Query(table) },
        writes,
        /** The stored row for a key, or undefined. */
        row: (key: string) => {
            const row = rows.get(key);
            return row ? { ...row } : undefined;
        },
        /** Changes a row as another writer would (bumps nothing unless `updated_at` is given). */
        set: (row: FakeSettingRow) => {
            rows.set(row.setting_key, { ...row });
        },
        /** The next platform_settings write answers with this error and changes nothing. */
        failNextWrite: (message = "write failed") => {
            nextWriteError = { message };
        },
    };
}
