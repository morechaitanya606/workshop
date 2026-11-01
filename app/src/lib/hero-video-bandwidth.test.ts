import { afterEach, describe, expect, it, vi } from "vitest";
import {
    HERO_VIDEO_STALL_WINDOW_MS,
    estimateDownloadKbps,
    findImageResourceTiming,
    hasStalledTooOften,
    isImageDownloadTooSlowForVideo,
    recordStall,
} from "./hero-video-bandwidth";

function timing(overrides: Partial<PerformanceResourceTiming>) {
    return {
        transferSize: 100 * 1024,
        responseStart: 1_000,
        responseEnd: 1_100,
        duration: 1_500,
        ...overrides,
    } as PerformanceResourceTiming;
}

function heroImage(
    currentSrc = "https://www.onlyworkshops.com/_next/image?url=%2Fhero.webp&w=828&q=75"
) {
    const image = document.createElement("img");
    Object.defineProperty(image, "currentSrc", { value: currentSrc });
    return image;
}

function stubResourceEntries(entries: PerformanceResourceTiming[]) {
    return vi.spyOn(performance, "getEntriesByName").mockReturnValue(entries);
}

describe("estimateDownloadKbps", () => {
    it("divides the bytes by the body download time", () => {
        // 100 KB in 2 s: about 410 kbps, a slow 4G link.
        expect(
            estimateDownloadKbps(timing({ responseStart: 1_000, responseEnd: 3_000 }))
        ).toBeCloseTo(409.6);
    });

    it("leaves the wait for the first byte (image optimizer work) out of the time", () => {
        // 3 s in total, but the body took 100 ms: a fast link behind a slow first response.
        const kbps = estimateDownloadKbps(
            timing({ responseStart: 2_900, responseEnd: 3_000, duration: 3_000 })
        );
        expect(kbps).toBeGreaterThan(8_000);
    });

    it("falls back to the whole duration where the browser hides responseStart", () => {
        expect(estimateDownloadKbps(timing({ responseStart: 0, duration: 800 }))).toBeCloseTo(
            1_024
        );
    });

    it("cannot tell from a cached, hidden, tiny or instant download", () => {
        expect(estimateDownloadKbps(null)).toBeNull();
        expect(estimateDownloadKbps(timing({ transferSize: 0 }))).toBeNull();
        expect(estimateDownloadKbps(timing({ transferSize: 8 * 1024 }))).toBeNull();
        expect(
            estimateDownloadKbps(timing({ responseStart: 0, responseEnd: 0, duration: 0 }))
        ).toBeNull();
    });
});

describe("findImageResourceTiming", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("looks the image up by the address it actually shows", () => {
        const image = heroImage();
        const entry = timing({});
        const lookup = stubResourceEntries([entry]);

        expect(findImageResourceTiming(image)).toBe(entry);
        expect(lookup).toHaveBeenCalledWith(image.currentSrc, "resource");
    });

    it("takes the real download when the preload and the image both left an entry", () => {
        const download = timing({ transferSize: 90_000 });
        stubResourceEntries([timing({ transferSize: 0 }), download]);

        expect(findImageResourceTiming(heroImage())).toBe(download);
    });

    it("finds nothing without an image or an entry", () => {
        stubResourceEntries([]);

        expect(findImageResourceTiming(null)).toBeNull();
        expect(findImageResourceTiming(heroImage(""))).toBeNull();
        expect(findImageResourceTiming(heroImage())).toBeNull();
    });
});

describe("isImageDownloadTooSlowForVideo", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("is true only for a measured download below 1 Mbps", () => {
        stubResourceEntries([timing({ responseStart: 1_000, responseEnd: 3_000 })]);
        expect(isImageDownloadTooSlowForVideo(heroImage())).toBe(true);
    });

    it("keeps the video where the image came down fast", () => {
        stubResourceEntries([timing({ responseStart: 1_000, responseEnd: 1_050 })]);
        expect(isImageDownloadTooSlowForVideo(heroImage())).toBe(false);
    });

    it("keeps the video when there is nothing to measure", () => {
        stubResourceEntries([timing({ transferSize: 0 })]);
        expect(isImageDownloadTooSlowForVideo(heroImage())).toBe(false);
        expect(isImageDownloadTooSlowForVideo(null)).toBe(false);
    });
});

describe("rebuffering count", () => {
    it("stops the video after three rebuffers in the window", () => {
        let times = recordStall([], 1_000);
        times = recordStall(times, 5_000);
        expect(hasStalledTooOften(times)).toBe(false);

        times = recordStall(times, 9_000);
        expect(hasStalledTooOften(times)).toBe(true);
    });

    it("forgets rebuffers older than the window", () => {
        let times = recordStall([], 0);
        times = recordStall(times, 1_000);
        times = recordStall(times, 1_000 + HERO_VIDEO_STALL_WINDOW_MS);

        expect(times).toEqual([1_000 + HERO_VIDEO_STALL_WINDOW_MS]);
        expect(hasStalledTooOften(times)).toBe(false);
    });
});
