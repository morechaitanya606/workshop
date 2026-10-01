import { z } from "zod";
import type { ChatbotLlmProvider, ChatbotLlmProviderName } from "@/lib/chatbot-llm-shared";

const nonEmpty = z.string().trim().min(1);

const publicEnvSchema = z.object({
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: nonEmpty.optional(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmpty.optional(),
    NEXT_PUBLIC_RAZORPAY_KEY_ID: nonEmpty.optional(),
    NEXT_PUBLIC_MAPPLS_API_KEY: nonEmpty.optional(),
    NEXT_PUBLIC_POSTHOG_KEY: nonEmpty.optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
    NEXT_PUBLIC_MEDIA_BASE_URL: z.string().url().optional(),
});

const serverEnvSchema = z.object({
    GROQ_API_KEY: nonEmpty.optional(),
    GROQ_MODEL: nonEmpty.optional(),
    GROQ_FALLBACK_MODEL: nonEmpty.optional(),
    OPENAI_API_KEY: nonEmpty.optional(),
    OPENAI_MODEL: nonEmpty.optional(),
    ANTHROPIC_API_KEY: nonEmpty.optional(),
    ANTHROPIC_MODEL: nonEmpty.optional(),
    HUGGINGFACE_CHAT_MODEL: nonEmpty.optional(),
    CHATBOT_LLM_PROVIDERS: nonEmpty.optional(),
    HUGGINGFACE_API_KEY: nonEmpty.optional(),
    HUGGINGFACE_EMBEDDING_MODEL: nonEmpty.optional(),
    HUGGINGFACE_EMBEDDING_ENDPOINT: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: nonEmpty.optional(),
    MAPPLS_CLIENT_ID: nonEmpty.optional(),
    MAPPLS_CLIENT_SECRET: nonEmpty.optional(),
    RAZORPAY_KEY_ID: nonEmpty.optional(),
    RAZORPAY_KEY_SECRET: nonEmpty.optional(),
    RAZORPAY_WEBHOOK_SECRET: nonEmpty.optional(),
    PAYMENT_NOTIFICATIONS_WEBHOOK_URL: z.string().url().optional(),
    PAYMENT_NOTIFICATIONS_WEBHOOK_SECRET: nonEmpty.optional(),
    RESEND_API_KEY: nonEmpty.optional(),
    MAILJET_API_KEY: nonEmpty.optional(),
    MAILJET_SECRET_KEY: nonEmpty.optional(),
    EMAIL_PROVIDER: z.enum(["mailjet", "resend"]).optional(),
    EMAIL_FROM: nonEmpty.optional(),
    CAREERS_INBOX_EMAIL: z.string().email().optional(),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: nonEmpty.optional(),
    SENTRY_DSN: z.string().url().optional(),
    CRON_SECRET: nonEmpty.optional(),
});

function parseOrThrow<T>(schema: z.ZodSchema<T>, raw: unknown, label: string) {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
        const issues = parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ");
        throw new Error(`Invalid ${label} configuration: ${issues}`);
    }
    return parsed.data;
}

export const publicEnv = parseOrThrow(
    publicEnvSchema,
    {
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        NEXT_PUBLIC_RAZORPAY_KEY_ID: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        NEXT_PUBLIC_MAPPLS_API_KEY: process.env.NEXT_PUBLIC_MAPPLS_API_KEY,
        NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
        NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
        NEXT_PUBLIC_MEDIA_BASE_URL: process.env.NEXT_PUBLIC_MEDIA_BASE_URL,
    },
    "public env"
);

export const env = parseOrThrow(
    serverEnvSchema.extend(publicEnvSchema.shape),
    {
        ...publicEnv,
        GROQ_API_KEY: process.env.GROQ_API_KEY,
        // `|| undefined` so a blank `GROQ_MODEL=` line means "use the default", not a boot error.
        GROQ_MODEL: process.env.GROQ_MODEL?.trim() || undefined,
        GROQ_FALLBACK_MODEL: process.env.GROQ_FALLBACK_MODEL?.trim() || undefined,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY?.trim() || undefined,
        OPENAI_MODEL: process.env.OPENAI_MODEL?.trim() || undefined,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY?.trim() || undefined,
        ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL?.trim() || undefined,
        HUGGINGFACE_CHAT_MODEL: process.env.HUGGINGFACE_CHAT_MODEL?.trim() || undefined,
        CHATBOT_LLM_PROVIDERS: process.env.CHATBOT_LLM_PROVIDERS?.trim() || undefined,
        HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY,
        HUGGINGFACE_EMBEDDING_MODEL: process.env.HUGGINGFACE_EMBEDDING_MODEL,
        HUGGINGFACE_EMBEDDING_ENDPOINT: process.env.HUGGINGFACE_EMBEDDING_ENDPOINT,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        MAPPLS_CLIENT_ID: process.env.MAPPLS_CLIENT_ID,
        MAPPLS_CLIENT_SECRET: process.env.MAPPLS_CLIENT_SECRET,
        RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
        RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
        RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
        PAYMENT_NOTIFICATIONS_WEBHOOK_URL: process.env.PAYMENT_NOTIFICATIONS_WEBHOOK_URL,
        PAYMENT_NOTIFICATIONS_WEBHOOK_SECRET: process.env.PAYMENT_NOTIFICATIONS_WEBHOOK_SECRET,
        RESEND_API_KEY: process.env.RESEND_API_KEY,
        MAILJET_API_KEY: process.env.MAILJET_API_KEY,
        MAILJET_SECRET_KEY: process.env.MAILJET_SECRET_KEY,
        EMAIL_PROVIDER: process.env.EMAIL_PROVIDER || undefined,
        EMAIL_FROM: process.env.EMAIL_FROM,
        CAREERS_INBOX_EMAIL: process.env.CAREERS_INBOX_EMAIL,
        UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
        UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
        SENTRY_DSN: process.env.SENTRY_DSN,
        CRON_SECRET: process.env.CRON_SECRET,
    },
    "server env"
);

function getVercelAppUrl() {
    const vercelUrl =
        process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
    if (!vercelUrl) {
        return null;
    }

    return /^https?:\/\//i.test(vercelUrl) ? vercelUrl : `https://${vercelUrl}`;
}

/**
 * True only for a real production deployment, not merely a production-mode build.
 *
 * Vercel builds previews and production identically with NODE_ENV=production, so NODE_ENV
 * alone cannot tell them apart -- and requiring production-only operational secrets on that
 * basis breaks every preview and branch deploy, which is exactly what it did. VERCEL_ENV is
 * set at build and at runtime and does distinguish them. Off Vercel, NODE_ENV is all there is.
 */
function isProductionDeployment() {
    const vercelEnv = process.env.VERCEL_ENV?.trim();
    if (vercelEnv) {
        return vercelEnv === "production";
    }

    return process.env.NODE_ENV === "production";
}

function isLocalProductionRuntime() {
    return (
        process.env.NODE_ENV === "production" &&
        process.env.CI !== "true" &&
        (process.env.NEXT_PHASE === "phase-production-build" ||
            process.env.NEXT_PHASE === "phase-production-server" ||
            process.env.npm_lifecycle_event === "build" ||
            process.env.npm_lifecycle_event === "start")
    );
}

function getLocalAppUrl() {
    return `http://localhost:${process.env.PORT || "3000"}`;
}

function required(name: keyof typeof env): string {
    const value = env[name];
    if (typeof value !== "string" || !value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

export function getPublicSupabaseConfig() {
    const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
    const key =
        publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
        return null;
    }

    return { url, key };
}

export function getAppUrl() {
    const configuredUrl = publicEnv.NEXT_PUBLIC_APP_URL?.trim();
    if (configuredUrl) {
        return configuredUrl.replace(/\/$/, "");
    }

    const vercelUrl = getVercelAppUrl();
    if (vercelUrl) {
        return vercelUrl.replace(/\/$/, "");
    }

    if (process.env.NODE_ENV === "production" && !isLocalProductionRuntime()) {
        throw new Error("Missing required environment variable: NEXT_PUBLIC_APP_URL");
    }

    return getLocalAppUrl();
}

export function getAbsoluteUrl(path = "/") {
    if (/^https?:\/\//i.test(path)) {
        return path;
    }

    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${getAppUrl()}${normalizedPath}`;
}

export function getPublicMapplsKey() {
    return publicEnv.NEXT_PUBLIC_MAPPLS_API_KEY || null;
}

export function getMapplsClientConfig() {
    const clientId = env.MAPPLS_CLIENT_ID;
    const clientSecret = env.MAPPLS_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return null;
    }

    return { clientId, clientSecret };
}

export function getServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
}

export function getGroqConfig() {
    const apiKey = env.GROQ_API_KEY;
    if (!apiKey) {
        return null;
    }

    // The old hard-coded default, llama3-8b-8192, was decommissioned by Groq on 2025-08-30, so
    // every call failed and the chatbot silently fell back to raw FAQ text. The default is now
    // a current production model (strong multilingual quality); the fallback is the fast 8B
    // model, which has its own rate-limit bucket. Both can be overridden per environment.
    const model = env.GROQ_MODEL || "llama-3.3-70b-versatile";
    const fallbackModel = env.GROQ_FALLBACK_MODEL || "llama-3.1-8b-instant";

    return {
        apiKey,
        endpoint: "https://api.groq.com/openai/v1/chat/completions",
        model,
        fallbackModel: fallbackModel === model ? null : fallbackModel,
    };
}

/** Claude first for answer quality; a provider without a key is simply skipped. */
const CHATBOT_PROVIDER_ORDER: readonly ChatbotLlmProviderName[] = [
    "anthropic",
    "groq",
    "openai",
    "huggingface",
];

/** `CHATBOT_LLM_PROVIDERS=anthropic,groq` picks which providers run and in what order. */
function parseChatbotProviderOrder(value: string | undefined): ChatbotLlmProviderName[] {
    const requested = (value || "")
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter((part): part is ChatbotLlmProviderName =>
            (CHATBOT_PROVIDER_ORDER as readonly string[]).includes(part)
        );
    const unique = Array.from(new Set(requested));
    return unique.length > 0 ? unique : [...CHATBOT_PROVIDER_ORDER];
}

/**
 * Every chatbot model provider that has a key, in failover order. Each key is optional: the
 * chain uses whatever is configured, and with none at all the chatbot still answers from
 * workshop data and FAQs.
 */
export function getChatbotLlmProviders(): ChatbotLlmProvider[] {
    const configured: Partial<Record<ChatbotLlmProviderName, ChatbotLlmProvider>> = {};

    const groq = getGroqConfig();
    if (groq) {
        configured.groq = {
            name: "groq",
            apiKey: groq.apiKey,
            endpoint: groq.endpoint,
            models: [groq.model, groq.fallbackModel].filter((m): m is string => !!m),
        };
    }

    if (env.OPENAI_API_KEY) {
        configured.openai = {
            name: "openai",
            apiKey: env.OPENAI_API_KEY,
            endpoint: "https://api.openai.com/v1/chat/completions",
            // gpt-4o-mini backs up a configured model that is retired or unavailable to the key.
            models: Array.from(new Set([env.OPENAI_MODEL || "gpt-4.1-mini", "gpt-4o-mini"])),
        };
    }

    if (env.ANTHROPIC_API_KEY) {
        configured.anthropic = {
            name: "anthropic",
            apiKey: env.ANTHROPIC_API_KEY,
            models: [env.ANTHROPIC_MODEL || "claude-opus-5-5"],
        };
    }

    // The same token as embeddings; it needs the "Make calls to Inference Providers"
    // permission. Without it the router answers 401/403 and the chain moves on.
    if (env.HUGGINGFACE_API_KEY) {
        configured.huggingface = {
            name: "huggingface",
            apiKey: env.HUGGINGFACE_API_KEY,
            endpoint: "https://router.huggingface.co/v1/chat/completions",
            models: [env.HUGGINGFACE_CHAT_MODEL || "meta-llama/Llama-3.1-8B-Instruct"],
        };
    }

    return parseChatbotProviderOrder(env.CHATBOT_LLM_PROVIDERS)
        .map((name) => configured[name])
        .filter((provider): provider is ChatbotLlmProvider => !!provider);
}

export function getHuggingFaceEmbeddingConfig() {
    const apiKey = env.HUGGINGFACE_API_KEY;
    if (!apiKey) {
        return null;
    }

    const model = env.HUGGINGFACE_EMBEDDING_MODEL || "intfloat/multilingual-e5-base";
    const endpoint =
        env.HUGGINGFACE_EMBEDDING_ENDPOINT ||
        `https://api-inference.huggingface.co/pipeline/feature-extraction/${encodeURIComponent(
            model
        )}`;

    return {
        apiKey,
        model,
        endpoint,
    };
}

export function getRazorpayConfig() {
    const keyId = env.RAZORPAY_KEY_ID;
    const keySecret = env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
        return null;
    }
    return { keyId, keySecret };
}

export function getRazorpayWebhookSecret() {
    return required("RAZORPAY_WEBHOOK_SECRET");
}

export function getMissingProductionEnvVars() {
    const missing: string[] = [];
    const publicSupabaseKey =
        publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!publicEnv.NEXT_PUBLIC_APP_URL && !getVercelAppUrl() && !isLocalProductionRuntime()) {
        missing.push("NEXT_PUBLIC_APP_URL");
    }
    if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL) {
        missing.push("NEXT_PUBLIC_SUPABASE_URL");
    }
    if (!publicSupabaseKey) {
        missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)");
    }
    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
        missing.push("SUPABASE_SERVICE_ROLE_KEY");
    }
    if (!env.GROQ_API_KEY) {
        missing.push("GROQ_API_KEY");
    }
    if (!env.HUGGINGFACE_API_KEY) {
        missing.push("HUGGINGFACE_API_KEY");
    }
    if (!env.RAZORPAY_KEY_ID) {
        missing.push("RAZORPAY_KEY_ID");
    }
    if (!env.RAZORPAY_KEY_SECRET) {
        missing.push("RAZORPAY_KEY_SECRET");
    }
    // Everything below is needed by the LIVE deployment and never by the build, so it is
    // required only where it actually matters. Demanding it of every production-MODE build
    // blocks preview and branch deploys -- Vercel builds those with NODE_ENV=production too --
    // while proving nothing about production. Each of these failed a preview deploy in turn.
    //
    // What stays unconditional above: the NEXT_PUBLIC_* values, which are baked into the
    // client bundle, and the credentials used while prerendering. A preview genuinely cannot
    // build without those.
    if (isProductionDeployment()) {
        // Without these two the app boots clean and then fails silently at runtime: every
        // Razorpay webhook 500s on a missing secret, and no transactional mail is ever sent.
        if (!env.RAZORPAY_WEBHOOK_SECRET) {
            missing.push("RAZORPAY_WEBHOOK_SECRET");
        }
        // One working mail provider is enough: Mailjet (both keys) or Resend.
        if (!env.RESEND_API_KEY && !(env.MAILJET_API_KEY && env.MAILJET_SECRET_KEY)) {
            missing.push("MAILJET_API_KEY + MAILJET_SECRET_KEY (or RESEND_API_KEY)");
        }
        // Without a shared counter store, every guarded route falls back to a per-instance
        // Map. On Vercel that multiplies every limit by the number of live lambdas, so "20
        // holds per minute" becomes unbounded -- the seat-griefing and card-testing limits
        // are decorative.
        if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
            missing.push("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN");
        }
        // /api/cron/emails refuses to run in production without it, so an unset CRON_SECRET
        // is a silently dead reminder-and-feedback pipeline that nothing else reports.
        if (!env.CRON_SECRET) {
            missing.push("CRON_SECRET");
        }
    }

    return missing;
}

export function assertProductionEnv() {
    if (typeof window !== "undefined") {
        return; // Don't validate server variables in the browser
    }

    if (process.env.SKIP_ENV_VALIDATION === "true" || process.env.SKIP_ENV_VALIDATION === "1") {
        return;
    }

    if (process.env.NODE_ENV !== "production") {
        return;
    }

    const missing = getMissingProductionEnvVars();
    if (missing.length > 0) {
        throw new Error(
            `Missing required production environment variable(s): ${missing.join(", ")}`
        );
    }
}

assertProductionEnv();
