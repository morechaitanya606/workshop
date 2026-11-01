import { describe, expect, it } from "vitest";
import { SEO_CITIES } from "@/lib/seo";
import { SEO_TOPICS, getSeoTopicBySlug } from "@/lib/seo-topics";
import {
    MAX_LISTED_WORKSHOPS,
    buildLlmsTxt,
    type LlmsTxtCity,
    type LlmsTxtWorkshop,
} from "./build-llms-txt";

const SITE_URL = "https://www.onlyworkshops.com";
const absoluteUrl = (path: string) => `${SITE_URL}${path}`;
const pune = SEO_CITIES[0];

function workshop(overrides: Partial<LlmsTxtWorkshop>): LlmsTxtWorkshop {
    return {
        id: "workshop-1",
        title: "Workshop",
        date: "2026-10-24",
        time: "10:00:00",
        price: 1999,
        ...overrides,
    };
}

function build(live: LlmsTxtCity["live"]) {
    return buildLlmsTxt({ absoluteUrl, cities: [{ city: pune, live }] });
}

describe("buildLlmsTxt", () => {
    it("follows the llms.txt layout: H1, a one-paragraph summary, then link sections", () => {
        const text = build({ topics: [], upcoming: [] });
        const lines = text.split("\n");
        expect(lines[0]).toBe("# Only Workshops");
        expect(lines[1]).toBe("");
        expect(lines[2]).toMatch(/^> Only Workshops is .+ Pune/);
        expect(text.match(/^> /gm)).toHaveLength(1);
        expect(text.match(/^# /gm)).toHaveLength(1);
        expect(text).toContain("## Key pages");
        expect(text).toContain("## Optional");
        expect(text.endsWith("\n")).toBe(true);
        expect(text).not.toMatch(/\n{3,}/);
        // Every link line is "- [title](absolute url)" with an optional note.
        for (const line of lines.filter((l) => l.startsWith("- "))) {
            expect(line).toMatch(
                /^- \[[^\]]+\]\(https:\/\/www\.onlyworkshops\.com\/[^)]*\)(?:: .+)?$/
            );
        }
    });

    it("links the key pages with absolute URLs, the city hub right after the home page", () => {
        const text = build({ topics: [], upcoming: [] });
        const keyPaths = [
            "/",
            "/workshops/pune",
            "/explore",
            "/past-events",
            "/about",
            "/help",
            "/cancellations",
            "/contact",
        ];
        const keySection = text.split("## Key pages")[1].split("\n## ")[0];
        const linked = [...keySection.matchAll(/\]\((https:[^)]+)\)/g)].map((match) => match[1]);
        expect(linked).toEqual(keyPaths.map(absoluteUrl));
    });

    it("repeats the city intro and the contact details the site prints", () => {
        const text = build(null);
        for (const paragraph of pune.intro) expect(text).toContain(paragraph);
        expect(text).toContain(
            "Contact: reachout@onlyworkshops.com, +91 70284 78109 or +91 99216 04163."
        );
        expect(text).toContain("https://www.instagram.com/only_workshops");
    });

    it("lists the activity pages it is given, each with the first sentence of its intro", () => {
        const pottery = getSeoTopicBySlug("pottery")!;
        const terrarium = getSeoTopicBySlug("terrarium")!;
        const text = build({ topics: [pottery, terrarium], upcoming: [] });
        expect(text).toContain("## Workshop activities in Pune");
        expect(text).toContain(
            `- [Pottery Workshops & Classes in Pune](${SITE_URL}/workshops/pune/pottery): A pottery workshop is a hands-on session where you shape clay into something you can use, such as a bowl, a cup or a small planter.`
        );
        expect(text).toContain(`(${SITE_URL}/workshops/pune/terrarium)`);
        // Only the topics passed in: the caller applies the thin-content rule.
        expect(text).not.toContain("/workshops/pune/baking");
    });

    it("lists upcoming sessions in date order with the date, time, area and price", () => {
        const text = build({
            topics: [],
            upcoming: [
                workshop({
                    id: "babka-foccacia-workshop-1792135739899",
                    title: "Babka & Foccacia Workshop",
                    date: "2026-10-25",
                    time: "11:00:00",
                    price: 1999,
                    eventAddress: "Mirelle Patisserie, Above Poona Motors, Pune, Camp",
                }),
                workshop({
                    id: "ice-plunge-experience-1792388018842",
                    title: "Ice Plunge Experience",
                    date: "2026-10-24",
                    time: "09:00:00",
                    price: 1920,
                    location: "Designers Share Studio",
                    eventAddress: "https://maps.app.goo.gl/563pHF9mjsF5NmfA7",
                }),
            ],
        });
        const ice = `- [Ice Plunge Experience](${SITE_URL}/workshop/ice-plunge-experience-1792388018842): Sat, 24 Oct 2026, 9:00 am in Pune. ₹1,920 per person incl. GST.`;
        const babka = `- [Babka & Foccacia Workshop](${SITE_URL}/workshop/babka-foccacia-workshop-1792135739899): Sun, 25 Oct 2026, 11:00 am in Camp, Pune. ₹1,999 per person incl. GST.`;
        expect(text).toContain("## Upcoming workshops in Pune");
        expect(text).toContain(ice);
        expect(text).toContain(babka);
        expect(text.indexOf(ice)).toBeLessThan(text.indexOf(babka));
        // A pasted Maps link is never repeated as a place.
        expect(text).not.toContain("maps.app.goo.gl");
    });

    it("leaves out a missing price and time instead of inventing them", () => {
        const text = build({
            topics: [],
            upcoming: [workshop({ id: "open-studio", title: "Open Studio", price: 0, time: "" })],
        });
        expect(text).toContain(
            `- [Open Studio](${SITE_URL}/workshop/open-studio): Sat, 24 Oct 2026 in Pune.`
        );
        expect(text).not.toMatch(/free/i);
    });

    describe("offer prices and closed bookings", () => {
        const earlyBird = {
            listPrice: 1999,
            offerPrice: 1799,
            savings: 200,
            label: "Early bird 10% off",
            labels: ["Early bird 10% off"],
            discountText: "10% off",
            endsAt: "2026-10-31T00:00:00.000Z",
            availableUntil: "2026-10-31T00:00:00.000Z",
            couponId: null,
            perBooking: false,
        };
        const note = (overrides: Partial<LlmsTxtWorkshop>) =>
            build({ topics: [], upcoming: [workshop({ id: "w", title: "Clay", ...overrides })] })
                .split("\n")
                .find((line) => line.startsWith("- [Clay]"));

        it("gives the offer price with its end and the regular price, so it stays true", () => {
            expect(note({ offer: earlyBird })).toBe(
                `- [Clay](${SITE_URL}/workshop/w): Sat, 24 Oct 2026, 10:00 am in Pune. ₹1,799 per person incl. GST until Sat, 31 Oct 2026, 5:30 am (Early bird 10% off; regular ₹1,999).`
            );
        });

        it("says an offer without an advertised end can end at any time", () => {
            expect(
                note({ offer: { ...earlyBird, endsAt: null, label: "Diwali offer" } })
            ).toContain(
                "₹1,799 per person incl. GST with the current offer (Diwali offer; regular ₹1,999; the offer can end at any time)."
            );
        });

        it("keeps a per-booking discount per booking, at the per-person list price", () => {
            const fixed = {
                ...earlyBird,
                offerPrice: 1799,
                label: "Weekend offer",
                discountText: "₹200 off per booking",
                couponId: "c-1",
                perBooking: true,
            };
            const line = note({ offer: fixed });
            expect(line).toContain(
                "₹1,999 per person incl. GST; ₹200 off per booking until Sat, 31 Oct 2026, 5:30 am: Weekend offer."
            );
            expect(line).not.toContain("₹1,799");
        });

        it("never prints a price that is not a real discount on the list price", () => {
            for (const offer of [
                { ...earlyBird, offerPrice: 1999 },
                { ...earlyBird, listPrice: 2499 },
            ]) {
                expect(note({ offer })).toContain("in Pune. ₹1,999 per person incl. GST.");
                expect(note({ offer })).not.toContain("regular");
            }
        });

        it("says bookings are closed, with no offer", () => {
            const line = note({ offer: earlyBird, bookingsClosed: true });
            expect(line).toContain("in Pune. ₹1,999 per person incl. GST. Bookings closed.");
            expect(line).not.toContain("₹1,799");
            expect(note({ price: 0, bookingsClosed: true })).toContain("in Pune. Bookings closed.");
        });
    });

    it("keeps a title on one line and its brackets inside the link text", () => {
        const text = build({
            topics: [],
            upcoming: [workshop({ id: "x", title: "Clay [Beginners]\nEdition" })],
        });
        expect(text).toContain(`- [Clay \\[Beginners\\] Edition](${SITE_URL}/workshop/x)`);
    });

    it("caps the upcoming list and points to /explore for the rest", () => {
        const upcoming = Array.from({ length: MAX_LISTED_WORKSHOPS + 5 }, (_, index) =>
            workshop({ id: `w-${index}`, title: `Session ${index}` })
        );
        const text = build({ topics: [], upcoming });
        const section = text.split("## Upcoming workshops in Pune")[1].split("\n## ")[0];
        expect(section.match(/^- /gm)).toHaveLength(MAX_LISTED_WORKSHOPS + 1);
        expect(section).toContain(`- [More upcoming workshops](${SITE_URL}/explore)`);
    });

    it("still returns the static sections when the workshops could not be read", () => {
        const text = build(null);
        expect(text).toContain("## Key pages");
        expect(text).toContain("## Optional");
        expect(text).not.toContain("## Workshop activities");
        expect(text).not.toContain("## Upcoming workshops");
    });

    it("omits empty live sections rather than printing bare headings", () => {
        const text = build({ topics: [], upcoming: [] });
        expect(text).not.toContain("## Workshop activities");
        expect(text).not.toContain("## Upcoming workshops");
    });

    it("never names a rating or a review: reviews are switched off", () => {
        const text = build({ topics: [...SEO_TOPICS], upcoming: [workshop({})] });
        expect(text).not.toMatch(/\b(?:rating|rated|reviews?|stars?)\b/i);
    });
});
