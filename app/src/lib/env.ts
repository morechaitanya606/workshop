import { z } from "zod";

const nonEmpty = z.string().trim().min(1);

const publicEnvSchema = z.object({
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: nonEmpty.optional(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmpty.optional(),
    NEXT_PUBLIC_MAPPLS_API_KEY: nonEmpty.optional(),
    NEXT_PUBLIC_POSTHOG_KEY: nonEmpty.optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
});

const serverEnvSchema = z.object({
    GROQ_API_KEY: nonEmpty.optional(),
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
    SENTRY_DSN: z.string().url().optional(),
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
        NEXT_PUBLIC_MAPPLS_API_KEY: process.env.NEXT_PUBLIC_MAPPLS_API_KEY,
        NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
        NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    },
    "public env"
);

export const env = parseOrThrow(
    serverEnvSchema.extend(publicEnvSchema.shape),
    {
        ...publicEnv,
        GROQ_API_KEY: process.env.GROQ_API_KEY,
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
        SENTRY_DSN: process.env.SENTRY_DSN,
    },
    "server env"
);

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

    if (process.env.NODE_ENV === "production") {
        throw new Error("Missing required environment variable: NEXT_PUBLIC_APP_URL");
    }

    return "http://localhost:3000";
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

export function getGroqApiKey() {
    return required("GROQ_API_KEY");
}

export function getGroqConfig() {
    const apiKey = env.GROQ_API_KEY;
    if (!apiKey) {
        return null;
    }

    return {
        apiKey,
        endpoint: "https://api.groq.com/openai/v1/chat/completions",
        model: "llama3-8b-8192",
    };
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

    if (!publicEnv.NEXT_PUBLIC_APP_URL) {
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

    return missing;
}

export function assertProductionEnv() {
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
