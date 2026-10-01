import type { SupabaseServerClient } from "@/lib/supabase-server";

type RpcError = { code?: string; message?: string; details?: string; hint?: string } | null;

/**
 * Calls a database function that `database.types.ts` does not describe yet.
 *
 * The money-path RPCs added in 20261001110100+ (create_host_payout, refund_booking) land
 * before the generated types are refreshed, and a typed `rpc()` rejects unknown names at
 * compile time. This keeps the cast in one place; drop it once `supabase gen types` has been
 * re-run and call `client.rpc(...)` directly.
 */
export async function callUntypedRpc<T>(
    client: SupabaseServerClient,
    name: string,
    args: Record<string, unknown>
): Promise<{ data: T | null; error: RpcError }> {
    const rpc = (
        client as unknown as {
            rpc: (
                fn: string,
                params: Record<string, unknown>
            ) => PromiseLike<{ data: unknown; error: RpcError }>;
        }
    ).rpc.bind(client);

    const { data, error } = await rpc(name, args);
    return { data: (data as T | null) ?? null, error };
}
