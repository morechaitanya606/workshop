import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";

// Same-origin proxy for remote images so the in-browser crop editor can read
// pixels and export them to a canvas without cross-origin tainting. Locked to
// the same image hosts allowed by next.config remotePatterns to avoid being an
// open proxy / SSRF vector.
const ALLOWED_HOSTS = new Set([
    "drive.google.com",
    "drive.usercontent.google.com",
    "images.unsplash.com",
]);
const ALLOWED_HOST_SUFFIXES = [
    ".supabase.co",
    ".googleusercontent.com",
    ".r2.cloudflarestorage.com",
];

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_REDIRECTS = 3;
/** Every other outbound call in the app is bounded; this one was not, so a slow upstream
 *  on an allowed host could pin the lambda until Vercel killed it at maxDuration. */
const UPSTREAM_TIMEOUT_MS = 8000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function isAllowedHost(hostname: string) {
    const host = hostname.toLowerCase();
    if (ALLOWED_HOSTS.has(host)) return true;
    return ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function isAllowedImageUrl(url: URL) {
    return url.protocol === "https:" && isAllowedHost(url.hostname);
}

async function fetchAllowedImage(initialUrl: URL) {
    let currentUrl = initialUrl;

    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

        let response: Response;
        try {
            response = await fetch(currentUrl.toString(), {
                redirect: "manual",
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timeout);
        }

        if (!REDIRECT_STATUSES.has(response.status)) {
            return response;
        }

        const location = response.headers.get("location");
        if (!location) {
            return response;
        }

        const nextUrl = new URL(location, currentUrl);
        if (!isAllowedImageUrl(nextUrl)) {
            throw new Error("DISALLOWED_REDIRECT");
        }

        currentUrl = nextUrl;
    }

    throw new Error("TOO_MANY_REDIRECTS");
}

async function readLimitedResponseBuffer(response: Response) {
    const contentLength = Number(response.headers.get("content-length") || "");
    if (Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
        throw new Error("IMAGE_TOO_LARGE");
    }

    if (!response.body) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength > MAX_BYTES) {
            throw new Error("IMAGE_TOO_LARGE");
        }
        return buffer;
    }

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalBytes += value.byteLength;
        if (totalBytes > MAX_BYTES) {
            await reader.cancel();
            throw new Error("IMAGE_TOO_LARGE");
        }

        chunks.push(Buffer.from(value));
    }

    return Buffer.concat(chunks, totalBytes);
}

export async function GET(request: NextRequest) {
    const limited = await enforceRateLimit(request, "expensive", "api-image-proxy");
    if (!limited.ok) return limited.response;

    const target = request.nextUrl.searchParams.get("url");
    if (!target) {
        return NextResponse.json({ error: "Missing url parameter." }, { status: 400 });
    }

    let parsed: URL;
    try {
        parsed = new URL(target);
    } catch {
        return NextResponse.json({ error: "Invalid url." }, { status: 400 });
    }

    if (!isAllowedImageUrl(parsed)) {
        return NextResponse.json({ error: "Image host not allowed." }, { status: 400 });
    }

    let upstream: Response;
    try {
        upstream = await fetchAllowedImage(parsed);
    } catch (error) {
        if (error instanceof Error && error.message === "DISALLOWED_REDIRECT") {
            return NextResponse.json(
                { error: "Image redirect host not allowed." },
                { status: 400 }
            );
        }
        if (error instanceof Error && error.message === "TOO_MANY_REDIRECTS") {
            return NextResponse.json({ error: "Too many image redirects." }, { status: 400 });
        }
        return NextResponse.json({ error: "Failed to fetch image." }, { status: 502 });
    }

    const contentType = (upstream.headers.get("content-type") || "")
        .split(";")[0]
        .trim()
        .toLowerCase();

    // Allowlist raster types only. `startsWith("image/")` admitted image/svg+xml, and an SVG
    // reflected back on our own origin with that Content-Type executes script in the context
    // of this site — a same-origin XSS driven entirely by an attacker-supplied URL.
    const ALLOWED_IMAGE_TYPES = new Set([
        "image/jpeg",
        "image/pjpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/avif",
        "image/heic",
        "image/heif",
    ]);

    if (!upstream.ok || !ALLOWED_IMAGE_TYPES.has(contentType)) {
        return NextResponse.json({ error: "Upstream is not a valid image." }, { status: 502 });
    }

    let buffer: Buffer;
    try {
        buffer = await readLimitedResponseBuffer(upstream);
    } catch (error) {
        if (error instanceof Error && error.message === "IMAGE_TOO_LARGE") {
            return NextResponse.json({ error: "Image is too large to crop." }, { status: 413 });
        }
        return NextResponse.json({ error: "Failed to read image." }, { status: 502 });
    }

    if (buffer.byteLength > MAX_BYTES) {
        return NextResponse.json({ error: "Image is too large to crop." }, { status: 413 });
    }

    return new NextResponse(buffer, {
        status: 200,
        headers: {
            "Content-Type": contentType,
            // Deterministic transform of a public URL: let the CDN absorb it instead of
            // paying for a function invocation and full re-fetch on every view.
            "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "inline",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    });
}
