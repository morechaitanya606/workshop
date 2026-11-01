// @vitest-environment node
import { renderToString } from "react-dom/server";
import * as Sentry from "@sentry/nextjs";
import { describe, expect, it, vi } from "vitest";
import type { Workshop } from "@/lib/data";
import { loadCityWorkshops } from "@/lib/workshop-page-data";
import AboutPage, { revalidate } from "./page";

vi.mock("@/components/Footer", () => ({
    default: () => null,
}));

vi.mock("@sentry/nextjs", () => ({
    captureException: vi.fn(),
}));

vi.mock("@/lib/workshop-page-data", () => ({
    loadCityWorkshops: vi.fn(),
}));

function workshopFixture(overrides: Partial<Workshop>): Workshop {
    return {
        id: "workshop-1",
        title: "Workshop",
        description: "",
        category: "",
        price: 1999,
        location: "",
        city: "Pune",
        duration: "2 hours",
        date: "2026-10-24",
        time: "10:00:00",
        maxSeats: 10,
        seatsRemaining: 5,
        coverImage: "/images/cover.jpg",
        galleryImages: [],
        rating: 0,
        reviewCount: 0,
        hostName: "",
        hostAvatar: "",
        hostBio: "",
        whatYouLearn: [],
        materialsProvided: [],
        ...overrides,
    };
}

const UPCOMING = [
    workshopFixture({
        id: "choclate-making-workshop",
        title: "Chocolate Making Workshop",
        date: "2099-01-10",
        location: "https://maps.app.goo.gl/abc",
        eventAddress: "https://maps.app.goo.gl/abc",
    }),
];
const PAST = [
    workshopFixture({
        id: "pottery-making-experience",
        title: "Pottery Making Experience",
        category: "Pottery",
        date: "2026-06-26",
        location: "Pottery Den Studio",
        eventAddress: "Pottery Den Studio, Baner Rd, Pallod Farms II, Pune, Maharashtra 411069",
        galleryImages: ["/a.jpg", "/b.jpg", "/c.jpg"],
    }),
    workshopFixture({
        id: "cookies-cakes-workshop",
        title: "Cookies & Cakes Workshop",
        date: "2026-04-03",
        location: "Butterish",
        eventAddress: "Butterish, Karvenagar, Pune, Maharashtra 411052",
    }),
];

const STATIC_HEADINGS = [
    "Our Story",
    "How It Works",
    "What We Value",
    "How We Vet Hosts",
    "Community First",
    "For Hosts and Venues",
];

/** Server HTML without React's `<!-- -->` text separators, so text reads as a visitor sees it. */
async function renderPage() {
    return renderToString(await AboutPage()).replace(/<!-- -->/g, "");
}

/** StaticPage draws one box per child section; an empty child would be an empty box. */
function boxCount(html: string) {
    return html.match(/border-l-4/g)?.length ?? 0;
}

describe("AboutPage", () => {
    it("revalidates on the same window as the city and activity pages", () => {
        expect(revalidate).toBe(300);
    });

    it("adds the data sections, with descriptive links to the activity pages", async () => {
        vi.mocked(loadCityWorkshops).mockResolvedValue({
            upcoming: UPCOMING,
            past: PAST,
            source: "supabase",
        });
        const html = await renderPage();

        expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
        expect(html).toMatch(/<h1[^>]*>About Only Workshops<\/h1>/);
        for (const heading of [
            ...STATIC_HEADINGS,
            "Our Workshops in Pune",
            "Where Our Pune Workshops Take Place",
        ]) {
            expect(html).toMatch(new RegExp(`<h2[^>]*>${heading}</h2>`));
        }
        expect(boxCount(html)).toBe(STATIC_HEADINGS.length + 2);

        expect(html).toContain(
            "Since April 2026, we have hosted 2 workshop sessions in Pune, and 1 more is on the calendar."
        );
        // Short anchors under the "Our Workshops in Pune" heading, not "<activity> in Pune" each.
        expect(html).toMatch(/href="\/workshops\/pune\/pottery"[^>]*>Pottery classes</);
        expect(html).toMatch(
            /href="\/workshops\/pune\/chocolate-making"[^>]*>Chocolate making workshop</
        );
        expect(html).not.toMatch(/href="\/workshops\/pune\/[^"]+"[^>]*>[^<]* in Pune</);
        expect(html).toContain("Pottery Den Studio in Baner");
        expect(html).not.toMatch(/goo\.gl|google\.com\/maps/);

        expect(html).toMatch(/href="\/workshops\/pune"[^>]*>hands-on workshops in Pune</);
        for (const href of ["/become-a-host", "/list-your-space", "/communities"]) {
            expect(html).toContain(`href="${href}"`);
        }
        expect(html).toContain('"@type":"AboutPage"');
    });

    it("leaves out the places section, without an empty box, when no row names a place", async () => {
        vi.mocked(loadCityWorkshops).mockResolvedValue({
            upcoming: UPCOMING,
            past: [],
            source: "supabase",
        });
        const html = await renderPage();

        expect(html).toMatch(/<h2[^>]*>Our Workshops in Pune<\/h2>/);
        expect(html).not.toContain("Where Our Pune Workshops Take Place");
        expect(boxCount(html)).toBe(STATIC_HEADINGS.length + 1);
    });

    it("keeps its own copy when the workshop read fails", async () => {
        vi.mocked(loadCityWorkshops).mockResolvedValue({ upcoming: [], past: [], source: "error" });
        const html = await renderPage();

        for (const heading of STATIC_HEADINGS) {
            expect(html).toMatch(new RegExp(`<h2[^>]*>${heading}</h2>`));
        }
        expect(html).not.toContain("Our Workshops in Pune");
        expect(boxCount(html)).toBe(STATIC_HEADINGS.length);
    });

    it("never crashes when the read throws, and reports the error", async () => {
        vi.mocked(loadCityWorkshops).mockRejectedValue(new Error("timeout"));
        const html = await renderPage();

        expect(html).toMatch(/<h1[^>]*>About Only Workshops<\/h1>/);
        expect(boxCount(html)).toBe(STATIC_HEADINGS.length);
        expect(Sentry.captureException).toHaveBeenCalledOnce();
    });
});
