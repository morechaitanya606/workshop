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
const ALLOWED_HOST_SUFFIXES = [".googleusercontent.com", ".r2.cloudflarestorage.com"];

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_REDIRECTS = 3;
/** Every other outbound call in the app is bounded; this one was not, so a slow upstream
 *  on an allowed host could pin the lambda until Vercel killed it at maxDuration. */
const UPSTREAM_TIMEOUT_MS = 8000;
/** The header timeout stops once headers arrive, so a host that trickles the body at a byte
 *  a second kept the lambda busy for as long as it liked. This bounds the WHOLE exchange. */
const TOTAL_DEADLINE_MS = 15_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * `*.supabase.co` admitted every tenant's project, i.e. any attacker with a free Supabase
 * account could host a payload on an "allowed" origin. Only OUR project's host is allowed.
 */
function getOwnSupabaseHost() {
    const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (!raw) return null;
    try {
        return new URL(raw).hostname.toLowerCase();
    } catch {
        return null;
    }
}

function isAllowedHost(hostname: string) {
    const host = hostname.toLowerCase();
    if (ALLOWED_HOSTS.has(host)) return true;
    if (host === getOwnSupabaseHost()) return true;
    return ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function isAllowedImageUrl(url: URL) {
    return url.protocol === "https:" && isAllowedHost(url.hostname);
}

/** `deadline` is shared by every hop AND the body read: aborting it tears down the stream. */
async function fetchAllowedImage(initialUrl: URL, deadline: AbortController) {
    let currentUrl = initialUrl;

    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
        const headerTimeout = setTimeout(() => deadline.abort(), UPSTREAM_TIMEOUT_MS);

        let response: Response;
        try {
            response = await fetch(currentUrl.toString(), {
                redirect: "manual",
                signal: deadline.signal,
            });
        } finally {
            clearTimeout(headerTimeout);
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

async function readLimitedResponseBuffer(response: Response, deadline: AbortController) {
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

    // Aborting the fetch signal normally errors an in-flight read(), but do not depend on
    // the runtime to do it: race every read against the deadline explicitly.
    const deadlineExceeded = new Promise<never>((_, reject) => {
        if (deadline.signal.aborted) {
            reject(new Error("DEADLINE_EXCEEDED"));
            return;
        }
        deadline.signal.addEventListener("abort", () => reject(new Error("DEADLINE_EXCEEDED")), {
            once: true,
        });
    });
    // Avoid an unhandled rejection when the read loop finishes before the deadline fires.
    deadlineExceeded.catch(() => undefined);

    try {
        while (true) {
            const { done, value } = await Promise.race([reader.read(), deadlineExceeded]);
            if (done) break;

            totalBytes += value.byteLength;
            if (totalBytes > MAX_BYTES) {
                await reader.cancel();
                throw new Error("IMAGE_TOO_LARGE");
            }

            chunks.push(Buffer.from(value));
        }
    } catch (error) {
        await reader.cancel().catch(() => undefined);
        throw error;
    }

    return Buffer.concat(chunks, totalBytes);
}

export async function GET(request: NextRequest) {
    const limited = await enforceRateLimit(request, "expensive", "api-image-proxy", undefined, {
        strict: true,
    });
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

    const deadline = new AbortController();
    const deadlineTimer = setTimeout(() => deadline.abort(), TOTAL_DEADLINE_MS);

    try {
        return await proxyImage(parsed, deadline);
    } finally {
        clearTimeout(deadlineTimer);
    }
}

async function proxyImage(parsed: URL, deadline: AbortController) {
    let upstream: Response;
    try {
        upstream = await fetchAllowedImage(parsed, deadline);
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
        // Release the connection instead of leaving a body we will never read open.
        upstream.body?.cancel().catch(() => undefined);
        return NextResponse.json({ error: "Upstream is not a valid image." }, { status: 502 });
    }

    let buffer: Buffer;
    try {
        buffer = await readLimitedResponseBuffer(upstream, deadline);
    } catch (error) {
        if (error instanceof Error && error.message === "IMAGE_TOO_LARGE") {
            return NextResponse.json({ error: "Image is too large to crop." }, { status: 413 });
        }
        if (deadline.signal.aborted) {
            return NextResponse.json({ error: "Image took too long to load." }, { status: 504 });
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
