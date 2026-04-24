import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const disablePersistentWebpackCache = process.platform === "win32";
const isProduction = process.env.NODE_ENV === "production";

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

/** @type {import('next').NextConfig} */
const baseConfig = {
    images: {
        formats: ["image/avif", "image/webp"],
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
    experimental: isProduction ? undefined : { cpus: 1 },
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
        distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    };

    if (process.env.NODE_ENV !== "production") {
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
