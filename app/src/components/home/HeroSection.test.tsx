import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HeroSection from "./HeroSection";
import { HERO_PLAYBACK_DEADLINE_MS, HERO_RESUME_GRACE_MS } from "./HeroVideoPanel";

/**
 * The bandwidth gates decide only whether the hero video is mounted; the server HTML (poster
 * image, headline, call to action) is the same for everyone.
 */

const MOBILE_QUERY = "(max-width: 640px)";

function stubMatchMedia({ mobile = false }: { mobile?: boolean } = {}) {
    vi.stubGlobal(
        "matchMedia",
        vi.fn((query: string) => ({
            media: query,
            // No reduced motion, no fine-pointer parallax; a phone only when asked for.
            matches: mobile && query === MOBILE_QUERY,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }))
    );
}

/** The hero image's Resource Timing: `bodyMs` to download 100 KB. */
function stubHeroImageDownload(bodyMs: number) {
    vi.spyOn(performance, "getEntriesByName").mockReturnValue([
        {
            transferSize: 100 * 1024,
            responseStart: 1_000,
            responseEnd: 1_000 + bodyMs,
            duration: 1_200 + bodyMs,
        } as PerformanceResourceTiming,
    ]);
}

function setNetworkInformation(connection: object | undefined) {
    Object.defineProperty(navigator, "connection", { value: connection, configurable: true });
}

function renderHero() {
    const view = render(<HeroSection source="supabase" />);
    const image = view.container.querySelector("img")!;
    Object.defineProperty(image, "currentSrc", { value: "http://localhost:3000/hero.avif" });
    return view;
}

/** The window `load` event, when the hero decides about the video. */
async function finishLoading() {
    await act(async () => {
        window.dispatchEvent(new Event("load"));
    });
}

function videos(view: ReturnType<typeof render>) {
    return Array.from(view.container.querySelectorAll("video"));
}

/** jsdom does not play media: tell the element how far it has got. */
function setCurrentTime(element: HTMLVideoElement, seconds: number) {
    Object.defineProperty(element, "currentTime", {
        value: seconds,
        configurable: true,
        writable: true,
    });
}

/** File name of a clip's source, e.g. "hero-4-mobile.mp4". */
function clipOf(element: HTMLVideoElement) {
    return element.getAttribute("src")?.split("/").pop();
}

async function startHero({ mobile = false }: { mobile?: boolean } = {}) {
    stubMatchMedia({ mobile });
    vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    stubHeroImageDownload(50);
    const view = renderHero();
    await finishLoading();
    return view;
}

describe("HeroSection video gates", () => {
    beforeEach(() => {
        stubMatchMedia();
        setNetworkInformation(undefined); // iOS Safari and Firefox
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        setNetworkInformation(undefined);
    });

    it("server-renders the poster image and no video", () => {
        const html = renderToString(<HeroSection source="supabase" />);
        expect(html).toContain("<img");
        expect(html).not.toContain("<video");
    });

    it("plays the videos where the hero image came down fast", async () => {
        const view = await startHero();

        expect(videos(view)).toHaveLength(3);
    });

    it("keeps the poster where the hero image came down below 1 Mbps", async () => {
        vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
        stubHeroImageDownload(2_000);
        const view = renderHero();
        await finishLoading();

        expect(videos(view)).toHaveLength(0);
    });

    it("leaves browsers with navigator.connection to the existing check", async () => {
        setNetworkInformation({ effectiveType: "4g", saveData: false });
        vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
        stubHeroImageDownload(2_000);
        const view = renderHero();
        await finishLoading();

        expect(videos(view).length).toBeGreaterThan(0);
    });

    it("drops every video when a playing one keeps rebuffering", async () => {
        const view = await startHero();

        const element = videos(view)[0];
        setCurrentTime(element, 5);
        fireEvent.playing(element);
        fireEvent.waiting(element);
        fireEvent.waiting(element);
        expect(videos(view)).toHaveLength(3);

        fireEvent.waiting(element);
        expect(videos(view)).toHaveLength(0);
    });

    it("does not count a looping clip pausing as it jumps back to its start", async () => {
        const view = await startHero();

        // The 22 s side clip wraps every 22 s: each wrap raises `waiting` (the browser fetches the
        // start of the file again). Six of them are no reason to drop anything.
        const left = videos(view)[0];
        fireEvent.playing(left);
        setCurrentTime(left, 0.2);
        for (let i = 0; i < 6; i += 1) fireEvent.waiting(left);
        expect(videos(view)).toHaveLength(3);
        // The browser can take a few seconds to fetch the start again: still the restart.
        setCurrentTime(left, 2.5);
        for (let i = 0; i < 6; i += 1) fireEvent.waiting(left);
        expect(videos(view)).toHaveLength(3);

        // Further into the loop the same pauses are real, and count.
        setCurrentTime(left, 5);
        fireEvent.waiting(left);
        fireEvent.waiting(left);
        fireEvent.waiting(left);
        expect(videos(view)).toHaveLength(0);
    });

    it("counts a pause of the playlist clip even right after it started: it does not loop", async () => {
        const view = await startHero();

        const middle = videos(view)[1];
        fireEvent.playing(middle);
        setCurrentTime(middle, 0.2);
        fireEvent.waiting(middle);
        fireEvent.waiting(middle);
        fireEvent.waiting(middle);
        expect(videos(view)).toHaveLength(0);
    });

    it("does not count a stalled event while enough is buffered", async () => {
        const view = await startHero();

        const element = videos(view)[0];
        setCurrentTime(element, 5);
        Object.defineProperty(element, "readyState", { value: 4, configurable: true });
        fireEvent.playing(element);
        fireEvent.stalled(element);
        fireEvent.stalled(element);
        fireEvent.stalled(element);
        expect(videos(view)).toHaveLength(3);
    });
});

describe("HeroSection on a wide screen: three panels", () => {
    beforeEach(() => {
        setNetworkInformation(undefined);
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        setNetworkInformation(undefined);
    });

    it("puts the new clips on the sides and the current clips in the middle", async () => {
        const view = await startHero();

        const [left, middle, right] = videos(view);
        expect(clipOf(left)).toBe("hero-4-mobile.mp4");
        expect(clipOf(middle)).toBe("hero-1-mobile.mp4");
        expect(clipOf(right)).toBe("hero-5-mobile.mp4");
        // Three equal columns, left to right.
        expect(view.getByTestId("hero-panels")).toHaveClass("grid", "grid-cols-3");
        expect(view.getByTestId("hero-panels").children).toHaveLength(3);
    });

    it("loops each side clip on its own and never advances it", async () => {
        const view = await startHero();

        const [left, , right] = videos(view);
        expect(left).toHaveProperty("loop", true);
        expect(right).toHaveProperty("loop", true);
        expect(left).toHaveProperty("muted", true);

        fireEvent.ended(left);
        fireEvent.ended(right);
        expect(clipOf(videos(view)[0])).toBe("hero-4-mobile.mp4");
        expect(clipOf(videos(view)[2])).toBe("hero-5-mobile.mp4");
    });

    it("plays the middle clips one after another and loops back to the first", async () => {
        const view = await startHero();

        expect(videos(view)[1]).toHaveProperty("loop", false);
        const order: Array<string | undefined> = [clipOf(videos(view)[1])];
        for (let i = 0; i < 3; i += 1) {
            fireEvent.ended(videos(view)[1]);
            order.push(clipOf(videos(view)[1]));
        }

        expect(order).toEqual([
            "hero-1-mobile.mp4",
            "hero-2-mobile.mp4",
            "hero-3-mobile.mp4",
            "hero-1-mobile.mp4",
        ]);
        // The side panels were not touched by the middle moving on.
        expect(clipOf(videos(view)[0])).toBe("hero-4-mobile.mp4");
        expect(clipOf(videos(view)[2])).toBe("hero-5-mobile.mp4");
    });

    it("skips a middle clip that cannot load and keeps the other panels", async () => {
        const view = await startHero();

        fireEvent.error(videos(view)[1]);
        expect(clipOf(videos(view)[1])).toBe("hero-2-mobile.mp4");
        expect(videos(view)).toHaveLength(3);
    });

    it("leaves a failed side panel empty without moving the others", async () => {
        const view = await startHero();

        fireEvent.error(videos(view)[0]);

        const cells = Array.from(view.getByTestId("hero-panels").children);
        expect(cells).toHaveLength(3);
        expect(cells[0].querySelector("video")).toBeNull();
        expect(clipOf(cells[1].querySelector("video")!)).toBe("hero-1-mobile.mp4");
        expect(clipOf(cells[2].querySelector("video")!)).toBe("hero-5-mobile.mp4");
    });

    it("gives up on a panel that never starts, and keeps the ones that play", async () => {
        // The clock is faked before the hero starts, so the start deadlines run on it.
        vi.useFakeTimers();
        const view = await startHero();

        fireEvent.playing(videos(view)[0]);
        await act(async () => {
            vi.advanceTimersByTime(HERO_PLAYBACK_DEADLINE_MS + 100);
        });

        // The right panel has one clip and it never started: given up. The middle moved on to
        // its next clip. The left one is playing and stays.
        expect(videos(view)).toHaveLength(2);
        expect(clipOf(videos(view)[0])).toBe("hero-4-mobile.mp4");
        expect(clipOf(videos(view)[1])).toBe("hero-2-mobile.mp4");

        // Once all three middle clips have failed to start, it gives up too. One deadline per
        // step: each clip's timer is armed only after the previous failure has rendered.
        for (let step = 0; step < 2; step += 1) {
            await act(async () => {
                vi.advanceTimersByTime(HERO_PLAYBACK_DEADLINE_MS + 100);
            });
        }
        expect(videos(view)).toHaveLength(1);
        expect(clipOf(videos(view)[0])).toBe("hero-4-mobile.mp4");
    });
});

describe("HeroSection when the tab is hidden and comes back", () => {
    beforeEach(() => {
        setNetworkInformation(undefined);
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        setNetworkInformation(undefined);
    });

    /** The left panel, playing, 10 s into its clip. */
    async function playingLeft() {
        const view = await startHero();
        const left = videos(view)[0];
        setCurrentTime(left, 10);
        fireEvent.playing(left);
        return { view, left };
    }

    it("does not count buffering while the tab is hidden", async () => {
        const { view, left } = await playingLeft();
        const visibility = vi.spyOn(document, "visibilityState", "get");

        visibility.mockReturnValue("hidden");
        for (let i = 0; i < 6; i += 1) fireEvent.waiting(left);
        expect(videos(view)).toHaveLength(3);

        // Visible again and never hidden-then-shown as far as the page saw: pauses count again.
        visibility.mockReturnValue("visible");
        for (let i = 0; i < 3; i += 1) fireEvent.waiting(left);
        expect(videos(view)).toHaveLength(0);
    });

    it("gives a tab that just came back a few seconds to catch up", async () => {
        const { view, left } = await playingLeft();
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
        const now = vi.spyOn(performance, "now");

        now.mockReturnValue(10_000);
        document.dispatchEvent(new Event("visibilitychange"));

        // A second after it came back, the video is still catching up.
        now.mockReturnValue(11_000);
        for (let i = 0; i < 6; i += 1) fireEvent.waiting(left);
        expect(videos(view)).toHaveLength(3);

        // Once the grace period is over the same pauses count.
        now.mockReturnValue(10_000 + HERO_RESUME_GRACE_MS + 1);
        for (let i = 0; i < 3; i += 1) fireEvent.waiting(left);
        expect(videos(view)).toHaveLength(0);
    });
});

describe("HeroSection on a phone: one clip at a time", () => {
    beforeEach(() => {
        setNetworkInformation(undefined);
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        setNetworkInformation(undefined);
    });

    it("plays all five clips in order and loops back to the first", async () => {
        const view = await startHero({ mobile: true });

        expect(videos(view)).toHaveLength(1);
        expect(videos(view)[0]).toHaveProperty("loop", false);

        const order: Array<string | undefined> = [clipOf(videos(view)[0])];
        for (let i = 0; i < 5; i += 1) {
            fireEvent.ended(videos(view)[0]);
            order.push(clipOf(videos(view)[0]));
        }

        expect(order).toEqual([
            "hero-1-mobile.mp4",
            "hero-2-mobile.mp4",
            "hero-3-mobile.mp4",
            "hero-4-mobile.mp4",
            "hero-5-mobile.mp4",
            "hero-1-mobile.mp4",
        ]);
        expect(view.queryByTestId("hero-panels")).toBeNull();
    });

    it("skips a clip that cannot load, and stops once every clip has failed", async () => {
        const view = await startHero({ mobile: true });

        fireEvent.error(videos(view)[0]);
        expect(clipOf(videos(view)[0])).toBe("hero-2-mobile.mp4");

        for (const name of ["hero-2", "hero-3", "hero-4", "hero-5"]) {
            expect(clipOf(videos(view)[0])).toBe(`${name}-mobile.mp4`);
            fireEvent.error(videos(view)[0]);
        }
        // Every clip failed: the poster image is all that is left, and nothing spins forever.
        expect(videos(view)).toHaveLength(0);
    });
});
