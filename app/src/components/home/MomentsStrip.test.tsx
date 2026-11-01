import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MomentsRows, { type MomentPhoto } from "./MomentsStrip";

const PHOTOS: MomentPhoto[] = Array.from({ length: 6 }, (_, index) => ({
    id: `photo-${index}`,
    src: `/images/moment-${index}.jpg`,
    alt: `Workshop moment ${index + 1}`,
    href: `/workshop/workshop-${index}`,
}));

describe("MomentsRows", () => {
    it("gives every image in the server HTML, loop repeats included, a non-empty alt", () => {
        const html = renderToString(<MomentsRows photos={PHOTOS} shouldReduceMotion={false} />);
        const alts = [...html.matchAll(/<img[^>]*\balt="([^"]*)"/g)].map((match) => match[1]);

        expect(alts.length).toBeGreaterThan(PHOTOS.length);
        expect(alts.every((alt) => alt.length > 0)).toBe(true);
    });
});
