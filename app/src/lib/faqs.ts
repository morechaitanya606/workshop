import { unstable_cache } from "next/cache";
import { NotCached, readThroughCache } from "@/lib/cache-success-only";
import { getPlatformChatbotClient } from "@/lib/chatbot-clients";
import {
    createSupabaseServiceClient,
    isSupabaseServiceConfigured,
    type SupabaseServerClient,
} from "@/lib/supabase-server";

export const FAQ_PUBLIC_SELECT_FIELDS = "id, question, answer";
export const FAQ_ADMIN_SELECT_FIELDS = "id, client_id, question, answer, created_at, updated_at";
export const FAQ_LEGACY_SELECT_FIELDS = "id, question, answer, created_at, updated_at";

export type PublicFaqRow = {
    id: string;
    question: string;
    answer: string;
};

export type AdminFaqRow = PublicFaqRow & {
    client_id?: string;
    created_at?: string;
    updated_at?: string;
};

function getErrorMessage(error: unknown) {
    return error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message || "").toLowerCase()
        : "";
}

export function isMissingFaqTableError(error: unknown) {
    const message = getErrorMessage(error);

    return (
        message.includes("faq") &&
        (message.includes("does not exist") || message.includes("schema cache"))
    );
}

export function isMissingClientTableError(error: unknown) {
    const message = getErrorMessage(error);

    return (
        message.includes("clients") &&
        (message.includes("does not exist") || message.includes("schema cache"))
    );
}

export function isFaqClientScopeUnavailableError(error: unknown) {
    const message = getErrorMessage(error);

    return (
        isMissingClientTableError(error) ||
        (message.includes("client_id") &&
            (message.includes("does not exist") ||
                message.includes("schema cache") ||
                message.includes("could not find")))
    );
}

export async function getOptionalPlatformChatbotClient(client: SupabaseServerClient) {
    try {
        return await getPlatformChatbotClient(client);
    } catch (error) {
        if (isMissingClientTableError(error)) {
            return null;
        }

        throw error;
    }
}

export async function loadAdminFaqRows(client: SupabaseServerClient) {
    const platformClient = await getOptionalPlatformChatbotClient(client);

    if (platformClient) {
        const { data, error } = await client
            .from("faq")
            .select(FAQ_ADMIN_SELECT_FIELDS)
            .eq("client_id", platformClient.id)
            .order("updated_at", { ascending: false });

        if (!error) {
            return (Array.isArray(data) ? data : []) as AdminFaqRow[];
        }

        if (isMissingFaqTableError(error)) {
            return [];
        }

        if (!isFaqClientScopeUnavailableError(error)) {
            throw error;
        }
    }

    const { data, error } = await client
        .from("faq")
        .select(FAQ_LEGACY_SELECT_FIELDS)
        .order("updated_at", { ascending: false });

    if (error) {
        if (isMissingFaqTableError(error)) {
            return [];
        }

        throw error;
    }

    return (Array.isArray(data) ? data : []) as AdminFaqRow[];
}

/** The FAQ query; throws on any failure other than "no FAQ table yet". */
async function queryFaqRows(options?: { clientId?: string | null }): Promise<PublicFaqRow[]> {
    if (!isSupabaseServiceConfigured) {
        return [];
    }

    const client = createSupabaseServiceClient({ requestTimeoutMs: 5000 });
    const resolvedClientId =
        options?.clientId || (await getOptionalPlatformChatbotClient(client))?.id || null;

    if (resolvedClientId) {
        const { data, error } = await client
            .from("faq")
            .select(FAQ_PUBLIC_SELECT_FIELDS)
            .eq("client_id", resolvedClientId)
            .order("created_at", { ascending: true });

        if (!error) {
            return (Array.isArray(data) ? data : []) as PublicFaqRow[];
        }

        if (isMissingFaqTableError(error)) {
            return [];
        }

        if (!isFaqClientScopeUnavailableError(error)) {
            throw error;
        }
    }

    const { data, error } = await client
        .from("faq")
        .select(FAQ_PUBLIC_SELECT_FIELDS)
        .order("created_at", { ascending: true });

    if (error) {
        if (isMissingFaqTableError(error)) {
            return [];
        }

        throw error;
    }

    return (Array.isArray(data) ? data : []) as PublicFaqRow[];
}

export async function loadFaqRows(options?: { clientId?: string | null }) {
    try {
        return await queryFaqRows(options);
    } catch {
        return [];
    }
}

export const FAQS_TAG = "faqs";

/**
 * The public FAQ list for server-rendered pages, cached like the platform settings. The browser
 * fetch of /api/faqs never reached Google (robots.txt disallows /api), so the workshop page
 * renders these rows itself. The admin FAQ routes do not revalidate the tag, so an edit shows
 * within ten minutes, the same as the CDN cache on /api/faqs.
 */
const cachedFaqRows = unstable_cache(
    async () => {
        try {
            return await queryFaqRows();
        } catch {
            try {
                return await queryFaqRows();
            } catch {
                // Not cached: an empty FAQ would otherwise stick for ten minutes.
                throw new NotCached<PublicFaqRow[]>([]);
            }
        }
    },
    ["public-faqs"],
    { tags: [FAQS_TAG], revalidate: 600 }
);

export function getCachedFaqRows(): Promise<PublicFaqRow[]> {
    return readThroughCache(cachedFaqRows);
}
