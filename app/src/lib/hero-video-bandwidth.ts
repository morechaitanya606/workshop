/**
 * Hero video gates for slow connections, beyond the navigator.connection check in HeroSection.
 *
 * iOS Safari and Firefox do not expose navigator.connection, so every visitor on them used to
 * stream the hero clips (mobile 565-650 kbps, desktop three panels at once ~1.7 Mbps together,
 * each clip ~0.5-0.65 Mbps) whatever the link: on
 * slow 4G they stalled and took the bandwidth the rest of the page needed. There, the speed at
 * which the hero image itself came down is the measurement instead.
 */

/** Below this the clips cannot keep playing smoothly. */
export const HERO_VIDEO_MIN_KBPS = 1000;

/** A smaller download finishes within a few round trips and says little about bandwidth. */
export const HERO_VIDEO_MIN_SAMPLE_BYTES = 16 * 1024;

/** This many rebuffering events (`waiting` / `stalled`) while playing... */
export const HERO_VIDEO_STALL_LIMIT = 3;
/** ...within this window, and the video is dropped for the poster image. */
export const HERO_VIDEO_STALL_WINDOW_MS = 30_000;

type ResourceTimingSample = Pick<
    PerformanceResourceTiming,
    "transferSize" | "responseStart" | "responseEnd" | "duration"
>;

/**
 * Throughput in kbps of one download, or null when it cannot be told: served from the cache
 * (transferSize 0, which is also what a cross-origin response without Timing-Allow-Origin
 * reports) or too small to measure.
 *
 * The time is the body download (responseStart to responseEnd) where the browser reports it,
 * not the whole request: the wait for the first byte includes the image optimizer's work on a
 * CDN miss, which says nothing about the visitor's connection.
 */
export function estimateDownloadKbps(sample: ResourceTimingSample | null | undefined) {
    if (!sample) return null;

    const bytes = sample.transferSize;
    if (!bytes || bytes < HERO_VIDEO_MIN_SAMPLE_BYTES) return null;

    const ms =
        sample.responseStart > 0 && sample.responseEnd > sample.responseStart
            ? sample.responseEnd - sample.responseStart
            : sample.duration;
    if (!(ms > 0)) return null;

    // Bits per millisecond are kilobits per second.
    return (bytes * 8) / ms;
}

/** The Resource Timing entry of the image the element shows (the largest, if fetched twice). */
export function findImageResourceTiming(image: HTMLImageElement | null | undefined) {
    if (!image || typeof performance === "undefined") return null;
    if (typeof performance.getEntriesByName !== "function") return null;

    const src = image.currentSrc || image.src;
    if (!src) return null;

    const entries = performance.getEntriesByName(src, "resource") as PerformanceResourceTiming[];
    return entries.reduce<PerformanceResourceTiming | null>(
        (largest, entry) =>
            !largest || entry.transferSize > largest.transferSize ? entry : largest,
        null
    );
}

/**
 * True only when the hero image's download was measured and was clearly too slow for the clips.
 * Without a measurement the video plays exactly as before.
 */
export function isImageDownloadTooSlowForVideo(image: HTMLImageElement | null | undefined) {
    const kbps = estimateDownloadKbps(findImageResourceTiming(image));
    return kbps !== null && kbps < HERO_VIDEO_MIN_KBPS;
}

/** Adds a rebuffering event at `now` and drops the ones older than the window. */
export function recordStall(times: readonly number[], now: number) {
    return [...times.filter((time) => now - time < HERO_VIDEO_STALL_WINDOW_MS), now];
}

export function hasStalledTooOften(times: readonly number[]) {
    return times.length >= HERO_VIDEO_STALL_LIMIT;
}
