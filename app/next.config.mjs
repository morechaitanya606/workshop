import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const disablePersistentWebpackCache = process.platform === "win32";
const isProduction = process.env.NODE_ENV === "production";
const configuredBuildCpus = Number.parseInt(process.env.NEXT_BUILD_CPUS || "1", 10);
const buildCpus =
    Number.isFinite(configuredBuildCpus) && configuredBuildCpus > 0 ? configuredBuildCpus : 1;

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
        formats: ["image/avif", "image/webp"],
        qualities: [60, 70, 72, 75, 80],
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
    experimental: { cpus: buildCpus },
    async headers() {
        return [
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
        process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_AUTH_TOKEN
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
