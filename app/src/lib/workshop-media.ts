const DRIVE_FILE_PATH_RE = /\/file\/d\/([a-zA-Z0-9_-]+)/;
const DRIVE_SHORT_PATH_RE = /\/d\/([a-zA-Z0-9_-]+)/;
const BARE_DOMAIN_RE = /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/:?#]|$)/i;
const IMAGE_FILE_EXTENSION_RE = /\.(?:avif|gif|heic|heif|jpe?g|png|svg|webp)(?:[?#].*)?$/i;

export function normalizeUrlInput(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return "";

    if (trimmed.startsWith("//")) {
        return `https:${trimmed}`;
    }

    if (trimmed.startsWith("www.")) {
        return `https://${trimmed}`;
    }

    if (BARE_DOMAIN_RE.test(trimmed) && !trimmed.startsWith("/")) {
        return `https://${trimmed}`;
    }

    if (trimmed.startsWith("uploads/") || trimmed.startsWith("images/")) {
        return `/${trimmed}`;
    }

    return trimmed;
}

function parseUrl(value: string) {
    try {
        return new URL(value);
    } catch {
        return null;
    }
}

function extractGoogleDriveFileId(value: string) {
    const url = parseUrl(value);
    if (!url) return null;

    const hostname = url.hostname.toLowerCase();
    if (hostname !== "drive.google.com" && hostname !== "docs.google.com") {
        return null;
    }

    const queryId = url.searchParams.get("id");
    if (queryId) {
        return queryId;
    }

    const fileMatch = url.pathname.match(DRIVE_FILE_PATH_RE);
    if (fileMatch?.[1]) {
        return fileMatch[1];
    }

    const shortMatch = url.pathname.match(DRIVE_SHORT_PATH_RE);
    if (shortMatch?.[1]) {
        return shortMatch[1];
    }

    return null;
}

function extractYoutubeVideoId(value: string) {
    const url = parseUrl(value);
    if (!url) return null;

    const host = url.hostname.toLowerCase();
    if (host === "youtube.com" || host === "www.youtube.com") {
        if (url.pathname === "/watch") {
            return url.searchParams.get("v");
        }

        if (url.pathname.startsWith("/shorts/")) {
            return url.pathname.replace("/shorts/", "").split("/")[0] || null;
        }

        if (url.pathname.startsWith("/embed/")) {
            return url.pathname.replace("/embed/", "").split("/")[0] || null;
        }
    }

    if (host === "youtu.be" || host === "www.youtu.be") {
        return url.pathname.replace("/", "").split("/")[0] || null;
    }

    return null;
}

export function normalizeWorkshopImageUrlInput(value: string) {
    const trimmed = normalizeUrlInput(value);
    if (!trimmed) return "";

    const driveId = extractGoogleDriveFileId(trimmed);
    if (driveId) {
        // Google deprecated the `uc?export=view` hotlink endpoint (it now returns
        // a 303 with no image bytes). The `thumbnail` endpoint still serves the
        // image directly and is what browsers/next-image can render.
        return `https://drive.google.com/thumbnail?id=${driveId}&sz=w1200`;
    }

    return trimmed;
}

export function isSupportedWorkshopImageUrl(value: string | null | undefined) {
    const normalized = normalizeWorkshopImageUrlInput(value || "");
    if (!normalized) return false;

    if (normalized.startsWith("/")) {
        return IMAGE_FILE_EXTENSION_RE.test(normalized);
    }

    const url = parseUrl(normalized);
    if (!url) return false;

    const hostname = url.hostname.toLowerCase();
    if (hostname === "images.unsplash.com") return true;
    if (hostname === "drive.google.com" && url.pathname === "/thumbnail") return true;
    if (hostname === "drive.usercontent.google.com") return true;
    if (hostname.endsWith(".googleusercontent.com")) return true;
    if (hostname.endsWith(".supabase.co")) return true;
    if (hostname.endsWith(".r2.cloudflarestorage.com")) return true;

    return false;
}

export function normalizeWorkshopVideoUrlInput(value: string) {
    const trimmed = normalizeUrlInput(value);
    if (!trimmed) return "";

    const driveId = extractGoogleDriveFileId(trimmed);
    if (driveId) {
        return `https://drive.google.com/file/d/${driveId}/preview`;
    }

    const youtubeId = extractYoutubeVideoId(trimmed);
    if (youtubeId) {
        return `https://www.youtube.com/embed/${youtubeId}`;
    }

    return trimmed;
}

export function isDirectVideoFileUrl(value: string | null | undefined) {
    if (!value) return false;
    return /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(value.trim());
}
