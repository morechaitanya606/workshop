/**
 * Where site-owned video lives.
 *
 * Default: `/videos/<file>`. The four hero renditions are committed under app/public/videos
 * and served from Vercel's CDN (100 GB/month on Hobby, ~17,000 desktop homepage views), so the
 * homepage video works on every deploy with no upload step.
 *
 * Not Supabase Storage: the free tier's 5 GB/month egress is SHARED with API, auth and database
 * traffic, so ~850 desktop views would throttle the whole project, not just video. Moving the
 * files there once left the homepage with no video at all (see app/public/videos/README.md).
 *
 * Override: NEXT_PUBLIC_MEDIA_BASE_URL, any public origin -- e.g. a Cloudflare R2 bucket on
 * `https://pub-<id>.r2.dev/hero` or a custom domain -- once traffic justifies moving. R2's S3
 * endpoint (`<account>.r2.cloudflarestorage.com`) needs signed requests and does NOT serve
 * public objects, so it cannot be used here.
 *
 * Must read process.env.NEXT_PUBLIC_* literally: Next only inlines those into the client
 * bundle when the full property access appears in the source.
 */

const LOCAL_VIDEO_BASE = "/videos";

function trimSlashes(value: string) {
    return value.replace(/\/+$/, "");
}

export function getHeroMediaBaseUrl() {
    const explicit = process.env.NEXT_PUBLIC_MEDIA_BASE_URL?.trim();
    return explicit ? trimSlashes(explicit) : LOCAL_VIDEO_BASE;
}

export function heroVideoUrl(fileName: string) {
    return `${getHeroMediaBaseUrl()}/${fileName}`;
}
