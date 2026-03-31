import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const disablePersistentWebpackCache = process.platform === "win32";

/** @type {import('next').NextConfig} */
const baseConfig = {
    images: {
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
    experimental: {
        cpus: 1,
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
