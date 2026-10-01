import { afterEach, describe, expect, it, vi } from "vitest";
import { getHeroMediaBaseUrl, heroVideoUrl } from "./media";

describe("hero media url", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("serves the committed renditions from the site itself by default", () => {
        vi.stubEnv("NEXT_PUBLIC_MEDIA_BASE_URL", "");
        expect(heroVideoUrl("hero-triptych.mp4")).toBe("/videos/hero-triptych.mp4");
        expect(heroVideoUrl("hero-1-mobile.mp4")).toBe("/videos/hero-1-mobile.mp4");
    });

    it("never defaults to Supabase Storage, whose free egress is shared with the whole project", () => {
        vi.stubEnv("NEXT_PUBLIC_MEDIA_BASE_URL", "");
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
        expect(getHeroMediaBaseUrl()).toBe("/videos");
    });

    it("uses an explicit media origin when set and trims trailing slashes", () => {
        vi.stubEnv("NEXT_PUBLIC_MEDIA_BASE_URL", "https://pub-abc.r2.dev/hero//");
        expect(heroVideoUrl("hero-triptych.mp4")).toBe(
            "https://pub-abc.r2.dev/hero/hero-triptych.mp4"
        );
    });
});
