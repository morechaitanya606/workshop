/**
 * Decides how a host-supplied workshop video URL may be shown.
 *
 * Hosts can store any URL as `video_url`, and the gallery used to drop it straight into an
 * iframe `src`. Only a short list of known embed providers is framed now; direct video files play
 * in a `<video>` element; any other https URL is offered as a plain external link; everything
 * else (javascript:, data:, http:, garbage) is not rendered at all.
 */
export type VideoEmbed =
    | { kind: "embed"; src: string; provider: "youtube" | "vimeo" | "drive" }
    | { kind: "file"; src: string }
    | { kind: "link"; href: string };

const YOUTUBE_HOSTS = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
]);
const YOUTUBE_SHORT_HOSTS = new Set(["youtu.be", "www.youtu.be"]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);
const DIRECT_VIDEO_RE = /\.(?:mp4|webm|ogg|mov|m4v)(?:[?#].*)?$/i;
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{6,20}$/;
const VIMEO_ID_RE = /^\d{4,15}$/;
const DRIVE_ID_RE = /^[A-Za-z0-9_-]{10,}$/;

function parse(value: string) {
    try {
        return new URL(value);
    } catch {
        return null;
    }
}

function youtubeId(url: URL): string | null {
    const host = url.hostname.toLowerCase();
    let id: string | null = null;

    if (YOUTUBE_SHORT_HOSTS.has(host)) {
        id = url.pathname.split("/")[1] || null;
    } else if (YOUTUBE_HOSTS.has(host)) {
        if (url.pathname === "/watch") {
            id = url.searchParams.get("v");
        } else if (url.pathname.startsWith("/embed/")) {
            id = url.pathname.split("/")[2] || null;
        } else if (url.pathname.startsWith("/shorts/")) {
            id = url.pathname.split("/")[2] || null;
        }
    }

    return id && YOUTUBE_ID_RE.test(id) ? id : null;
}

function vimeoId(url: URL): string | null {
    if (!VIMEO_HOSTS.has(url.hostname.toLowerCase())) return null;

    const segments = url.pathname.split("/").filter(Boolean);
    const id = url.hostname.toLowerCase() === "player.vimeo.com" ? segments[1] : segments[0];

    return id && VIMEO_ID_RE.test(id) ? id : null;
}

function driveId(url: URL): string | null {
    if (url.hostname.toLowerCase() !== "drive.google.com") return null;

    const match = url.pathname.match(/^\/file\/d\/([^/]+)/);
    return match?.[1] && DRIVE_ID_RE.test(match[1]) ? match[1] : null;
}

export function getSafeVideoEmbed(rawUrl: string | null | undefined): VideoEmbed | null {
    const value = rawUrl?.trim();
    if (!value) return null;

    if (value.startsWith("/") && !value.startsWith("//")) {
        return DIRECT_VIDEO_RE.test(value) ? { kind: "file", src: value } : null;
    }

    const url = parse(value);
    if (!url || url.protocol !== "https:") return null;

    const yt = youtubeId(url);
    if (yt) {
        return {
            kind: "embed",
            provider: "youtube",
            src: `https://www.youtube-nocookie.com/embed/${yt}`,
        };
    }

    const vimeo = vimeoId(url);
    if (vimeo) {
        return {
            kind: "embed",
            provider: "vimeo",
            src: `https://player.vimeo.com/video/${vimeo}`,
        };
    }

    const drive = driveId(url);
    if (drive) {
        return {
            kind: "embed",
            provider: "drive",
            src: `https://drive.google.com/file/d/${drive}/preview`,
        };
    }

    if (DIRECT_VIDEO_RE.test(url.pathname)) {
        return { kind: "file", src: url.toString() };
    }

    return { kind: "link", href: url.toString() };
}

/** Restrictive iframe settings for the providers above; used with `getSafeVideoEmbed`. */
export const VIDEO_IFRAME_SANDBOX = "allow-scripts allow-same-origin allow-presentation";
export const VIDEO_IFRAME_ALLOW = "autoplay; encrypted-media; picture-in-picture; fullscreen";
