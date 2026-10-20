import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const disablePersistentWebpackCache = process.platform === "win32";
const isProduction = process.env.NODE_ENV === "production";
// Only constrain build parallelism when NEXT_BUILD_CPUS is set explicitly. Defaulting to 1 also
// capped Vercel builds (which have several cores) to a single worker.
const configuredBuildCpus = Number.parseInt(process.env.NEXT_BUILD_CPUS || "", 10);
const buildCpus =
    Number.isFinite(configuredBuildCpus) && configuredBuildCpus > 0 ? configuredBuildCpus : null;

const baseSecurityHeaders = [
    {
        key: "X-Content-Type-Options",
        value: "nosniff",
    },
    {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
    },
    {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
    },
];

const strictTransportSecurityHeader = isProduction
    ? [
          {
              key: "Strict-Transport-Security",
              value: "max-age=31536000; includeSubDomains; preload",
          },
      ]
    : [];

function getDevServerPort() {
    const argv = process.argv;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if ((arg === "-p" || arg === "--port") && argv[index + 1]) {
            return argv[index + 1];
        }
        if (arg.startsWith("--port=")) {
            return arg.slice("--port=".length);
        }
    }

    return process.env.PORT || "3000";
}

function getDevDistDir() {
    if (process.env.NEXT_DEV_DIST_DIR) {
        return process.env.NEXT_DEV_DIST_DIR;
    }

    const port = String(getDevServerPort()).replace(/[^0-9]/g, "") || "3000";
    return `.next-dev-${port}`;
}

/** @type {import('next').NextConfig} */
const baseConfig = {
    allowedDevOrigins: ["localhost:3000", "127.0.0.1:3000"],
    images: {
        // AVIF first: about 30% smaller than WebP for these photos. Keep formats and the default
        // deviceSizes stable: changing either gives every image new URLs, so all cached variants
        // go cold at once after the deploy.
        formats: ["image/avif", "image/webp"],
        qualities: [60, 70, 72, 75, 80],
        // Photo URLs are immutable (random upload paths / mirrored Drive ids). The default of 60s
        // let Vercel re-fetch and re-encode from the origin again and again; a month keeps every
        // variant warm so only the very first visitor to a width ever waits.
        minimumCacheTTL: 60 * 60 * 24 * 30,
        remotePatterns: [
            {
                protocol: "https",
                hostname: "*.supabase.co",
            },
            {
                protocol: "https",
                hostname: "*.r2.cloudflarestorage.com",
            },
            {
                // Cloudflare R2 public bucket URLs (pub-<id>.r2.dev), used for hero/media files.
                protocol: "https",
                hostname: "*.r2.dev",
            },
            {
                protocol: "https",
                hostname: "images.unsplash.com",
            },
            {
                protocol: "https",
                hostname: "drive.google.com",
            },
            {
                protocol: "https",
                hostname: "*.googleusercontent.com",
            },
            {
                protocol: "https",
                hostname: "drive.usercontent.google.com",
            },
        ],
    },
    // Limit build parallelism for more stable local builds on constrained machines.
    ...(buildCpus ? { experimental: { cpus: buildCpus } } : {}),
    async headers() {
        return [
            {
                // Hero clips (several MB each) were served with max-age=0, so every visit
                // re-validated them. A day of caching is safe even if a file is re-encoded in place.
                source: "/videos/:file*",
                headers: [
                    {
                        key: "Cache-Control",
                        value: "public, max-age=86400, stale-while-revalidate=604800",
                    },
                ],
            },
            {
                source: "/chatbot/embed",
                headers: [...baseSecurityHeaders, ...strictTransportSecurityHeader],
            },
            {
                source: "/:path((?!chatbot/embed$).*)",
                headers: [
                    ...baseSecurityHeaders,
                    ...strictTransportSecurityHeader,
                    {
                        key: "X-Frame-Options",
                        value: "SAMEORIGIN",
                    },
                ],
            },
        ];
    },
    webpack: (config) => {
        if (disablePersistentWebpackCache) {
            // Filesystem cache serialization is unstable on this Windows setup and has been
            // crashing local dev/build checks with Array buffer allocation failures.
            config.cache = false;
        }

        return config;
    },
};

export default async function configByPhase(phase) {
    const nextConfig = {
        ...baseConfig,
        // Prevent `next dev` and `next build` from mutating the same `.next` directory.
        distDir: phase === PHASE_DEVELOPMENT_SERVER ? getDevDistDir() : ".next",
    };

    const isSentryConfigured = Boolean(
        process.env.SENTRY_DSN ||
        process.env.NEXT_PUBLIC_SENTRY_DSN ||
        process.env.SENTRY_AUTH_TOKEN
    );

    if (process.env.NODE_ENV !== "production" || !isSentryConfigured) {
        return nextConfig;
    }

    const { withSentryConfig } = await import("@sentry/nextjs");
    return withSentryConfig(nextConfig, {
        silent: true,
        webpack: {
            treeshake: {
                removeDebugLogging: true,
            },
        },
    });
}
