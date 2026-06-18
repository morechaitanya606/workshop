import { NextRequest, NextResponse } from "next/server";

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

function isAllowedHost(hostname: string) {
    const host = hostname.toLowerCase();
    if (ALLOWED_HOSTS.has(host)) return true;
    return ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export async function GET(request: NextRequest) {
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

    if (parsed.protocol !== "https:" || !isAllowedHost(parsed.hostname)) {
        return NextResponse.json({ error: "Image host not allowed." }, { status: 400 });
    }

    let upstream: Response;
    try {
        upstream = await fetch(parsed.toString(), { redirect: "follow" });
    } catch {
        return NextResponse.json({ error: "Failed to fetch image." }, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (!upstream.ok || !contentType.startsWith("image/")) {
        return NextResponse.json({ error: "Upstream is not a valid image." }, { status: 502 });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES) {
        return NextResponse.json({ error: "Image is too large to crop." }, { status: 413 });
    }

    return new NextResponse(buffer, {
        status: 200,
        headers: {
            "Content-Type": contentType,
            "Cache-Control": "private, max-age=300",
        },
    });
}
