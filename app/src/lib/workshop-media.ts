const DRIVE_FILE_PATH_RE = /\/file\/d\/([a-zA-Z0-9_-]+)/;
const DRIVE_SHORT_PATH_RE = /\/d\/([a-zA-Z0-9_-]+)/;

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
    if (
        hostname !== "drive.google.com" &&
        hostname !== "docs.google.com"
    ) {
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
    const trimmed = value.trim();
    if (!trimmed) return "";

    const driveId = extractGoogleDriveFileId(trimmed);
    if (driveId) {
        return `https://drive.google.com/uc?export=view&id=${driveId}`;
    }

    return trimmed;
}

export function normalizeWorkshopVideoUrlInput(value: string) {
    const trimmed = value.trim();
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
