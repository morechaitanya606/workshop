import { describe, expect, it } from "vitest";
import {
    CITY_ROW_LIMIT,
    buildAboutStats,
    hostedSentence,
    monthLabel,
    topicCountText,
    venuesOf,
    whereSentence,
    type AboutStats,
} from "./about-stats";
import type { Workshop } from "@/lib/data";
import { SEO_CITIES } from "@/lib/seo";

const PUNE = SEO_CITIES[0];

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

/** Shapes of live rows (22 Oct 2026); addresses as stored, pasted Maps links included. */
const icePlunge = workshopFixture({
    id: "ice-plunge-experience",
    title: "Ice Plunge Experience",
    category: "Wellness",
    date: "2026-10-24",
    location: "Designers Share Studio",
    eventAddress: "https://maps.app.goo.gl/563pHF9mjsF5NmfA7",
});
const chocolate = workshopFixture({
    id: "choclate-making-workshop",
    title: "Chocolate Making Workshop",
    category: "Food & Drink",
    date: "2026-10-25",
    location: "Studio Creo",
    eventAddress: "https://maps.app.goo.gl/abc",
});
const pottery = workshopFixture({
    id: "pottery-making-experience",
    title: "Pottery Making Experience",
    category: "Pottery",
    date: "2026-06-26",
    location: "Pottery Den Studio",
    eventAddress:
        "Pottery Den Studio, S-4 Plot No 1 Street No 3, Baner Rd, Pallod Farms II, Pune, Maharashtra 411069",
    galleryImages: ["/a.jpg", "/b.jpg", "/c.jpg", "/d.jpg"],
});
const kimchi = workshopFixture({
    id: "korean-kimchi-making-experience",
    title: "Korean Kimchi Making Experience",
    category: "Food & Drink",
    date: "2026-06-28",
    location: "Iya's Korean Kitchen",
    eventAddress:
        "Iya's Korean Kitchen, Lane - G, S Main Rd, Iricen Railway Colony, Koregaon Park, Pune, Maharashtra 411001",
});
const cookiesMuffins = workshopFixture({
    id: "cookies-muffins-workshop",
    title: "Cookies & Muffins Workshop",
    category: "Food & Drink",
    date: "2026-04-28",
    location: "Butterish Kitchen & Studio",
    eventAddress: "Butterish, Karvenagar, Pune, Maharashtra 411052",
});
const cookiesCakes = workshopFixture({
    id: "cookies-cakes-workshop",
    title: "Cookies & Cakes Workshop",
    category: "Food & Drink",
    date: "2026-04-03",
    location: "Butterish",
    eventAddress: "Butterish, Karvenagar, Pune, Maharashtra 411052",
});

const UPCOMING = [icePlunge, chocolate];
const PAST = [kimchi, pottery, cookiesMuffins, cookiesCakes];

function statsFixture(overrides: Partial<AboutStats>): AboutStats {
    return {
        upcoming: 0,
        past: 0,
        capped: false,
        firstMonth: null,
        topics: [],
        areas: [],
        venues: [],
        ...overrides,
    };
}

describe("monthLabel", () => {
    it("names the month of an ISO date without touching time zones", () => {
        expect(monthLabel("2026-04-03")).toBe("April 2026");
        expect(monthLabel("2025-12-31")).toBe("December 2025");
    });

    it("gives null for anything else", () => {
        expect(monthLabel(null)).toBeNull();
        expect(monthLabel("")).toBeNull();
        expect(monthLabel("2026-13-01")).toBeNull();
        expect(monthLabel("April 2026")).toBeNull();
    });
});

describe("venuesOf", () => {
    it("names each venue once, fullest label first by use, with the area its address states", () => {
        expect(venuesOf([...UPCOMING, ...PAST])).toEqual([
            "Butterish Kitchen & Studio in Karvenagar",
            "Designers Share Studio",
            "Studio Creo",
            "Iya's Korean Kitchen in Koregaon Park",
            "Pottery Den Studio in Baner",
        ]);
    });

    it("never prints a pasted link, a street address, an area or a placeholder as a venue", () => {
        const rows = [
            workshopFixture({ location: "https://maps.app.goo.gl/xyz" }),
            workshopFixture({ location: "https://www.google.com/maps/place/Studio" }),
            workshopFixture({ location: "maps.app.goo.gl/563pHF9mjsF5NmfA7" }),
            workshopFixture({ location: "www.google.com/maps/place/Studio+Creo" }),
            workshopFixture({ location: "S-4 Plot No 1, Baner Rd, Pune, Maharashtra 411069" }),
            workshopFixture({ location: "Baner, Pune" }),
            workshopFixture({ location: "Koregaon Park" }),
            workshopFixture({ location: "TBA" }),
            workshopFixture({ location: "Pune" }),
            workshopFixture({ location: "   " }),
            // Areas in other spellings, roads and address words name a place, not a venue.
            workshopFixture({ location: "Karve Nagar, Pune" }),
            workshopFixture({ location: "Yerwada, Pune" }),
            workshopFixture({ location: "Kalyani-Nagar, Pune" }),
            workshopFixture({ location: "Sinhgad Road" }),
            workshopFixture({ location: "Baner Road, Pune" }),
            workshopFixture({ location: "Magarpatta Road, Hadapsar" }),
            workshopFixture({ location: "Pune, Maharashtra" }),
            workshopFixture({ location: "Hinjawadi Phase 1" }),
        ];
        expect(venuesOf(rows)).toEqual([]);
    });

    it("moves an area typed after the venue's name behind 'in', so a list never reads it as a venue", () => {
        expect(
            venuesOf([
                workshopFixture({ location: "Brew Lab, Kalyani Nagar" }),
                workshopFixture({
                    location: "Si Nonnas Sourdough Pizza, Kharadi",
                    eventAddress: "https://maps.app.goo.gl/xyz",
                }),
                workshopFixture({ location: "Baner, Studio Creo" }),
                workshopFixture({ location: "Clay Corner, Pune", eventAddress: "Aundh, Pune" }),
            ])
        ).toEqual([
            "Brew Lab in Kalyani Nagar",
            "Si Nonnas Sourdough Pizza in Kharadi",
            "Studio Creo in Baner",
            "Clay Corner in Aundh",
        ]);
    });

    it("keeps a venue whose name itself holds an area as typed", () => {
        expect(
            venuesOf([
                workshopFixture({ location: "Studio Creo Baner" }),
                workshopFixture({ location: "Boot Camp Studio" }),
            ])
        ).toEqual(["Studio Creo Baner", "Boot Camp Studio"]);
    });
});

describe("buildAboutStats", () => {
    it("is null when the city has no sessions, so the page shows only its own copy", () => {
        expect(buildAboutStats(PUNE, [], [])).toBeNull();
    });

    it("counts sessions and finds the first month from the rows", () => {
        const stats = buildAboutStats(PUNE, UPCOMING, PAST);
        expect(stats).toMatchObject({
            upcoming: 2,
            past: 4,
            capped: false,
            firstMonth: "April 2026",
            areas: ["Karvenagar", "Koregaon Park", "Baner"],
        });
    });

    it("links only activity pages that pass the thin-content rule, with short descriptive anchors", () => {
        const stats = buildAboutStats(PUNE, UPCOMING, PAST);
        // No "in Pune" on every anchor: the section heading already names the city.
        expect(stats?.topics).toEqual([
            {
                slug: "chocolate-making",
                href: "/workshops/pune/chocolate-making",
                label: "Chocolate making workshop",
                sessions: 1,
                upcoming: 1,
            },
            {
                slug: "ice-plunge",
                href: "/workshops/pune/ice-plunge",
                label: "Ice bath / ice plunge",
                sessions: 1,
                upcoming: 1,
            },
            {
                slug: "pottery",
                href: "/workshops/pune/pottery",
                label: "Pottery classes",
                sessions: 1,
                upcoming: 0,
            },
            {
                slug: "baking",
                href: "/workshops/pune/baking",
                label: "Baking classes",
                sessions: 2,
                upcoming: 0,
            },
            {
                slug: "cooking-classes",
                href: "/workshops/pune/cooking-classes",
                label: "Cooking & baking classes",
                sessions: 4,
                upcoming: 1,
            },
        ]);
    });

    it("treats a full read as a floor and drops the first month", () => {
        const past = Array.from({ length: CITY_ROW_LIMIT }, (_, index) =>
            workshopFixture({ id: `past-${index}`, date: "2026-01-10" })
        );
        const stats = buildAboutStats(PUNE, [], past);
        expect(stats?.capped).toBe(true);
        expect(stats?.firstMonth).toBeNull();
        expect(stats && hostedSentence(stats, "Pune")).toBe(
            "We have hosted at least 1,000 workshop sessions in Pune so far."
        );
    });
});

describe("hostedSentence", () => {
    it("states past and upcoming counts from the data", () => {
        const stats = buildAboutStats(PUNE, UPCOMING, PAST);
        expect(stats && hostedSentence(stats, "Pune")).toBe(
            "Since April 2026, we have hosted 4 workshop sessions in Pune, and 2 more are on the calendar."
        );
    });

    it("counts sessions, not dates: two sessions on one day are two", () => {
        const sameDay = [
            workshopFixture({ id: "a", date: "2026-10-24", time: "09:00:00" }),
            workshopFixture({ id: "b", date: "2026-10-24", time: "12:00:00" }),
        ];
        const stats = buildAboutStats(PUNE, sameDay, [cookiesCakes]);
        expect(stats && hostedSentence(stats, "Pune")).toBe(
            "Since April 2026, we have hosted 1 workshop session in Pune, and 2 more are on the calendar."
        );
    });

    it("follows the numbers into the singular and drops parts with nothing to say", () => {
        expect(
            hostedSentence(statsFixture({ past: 1, upcoming: 1, firstMonth: "June 2026" }), "Pune")
        ).toBe(
            "Since June 2026, we have hosted 1 workshop session in Pune, and 1 more is on the calendar."
        );
        expect(hostedSentence(statsFixture({ past: 3 }), "Pune")).toBe(
            "We have hosted 3 workshop sessions in Pune so far."
        );
        expect(hostedSentence(statsFixture({ upcoming: 1 }), "Pune")).toBe(
            "1 workshop session is on the calendar in Pune."
        );
        expect(hostedSentence(statsFixture({ upcoming: 3 }), "Pune")).toBe(
            "3 workshop sessions are on the calendar in Pune."
        );
        expect(hostedSentence(statsFixture({}), "Pune")).toBe("");
    });
});

describe("topicCountText", () => {
    it("splits hosted and upcoming sessions, leaving out a part with none", () => {
        expect(topicCountText({ sessions: 1, upcoming: 0 })).toBe("1 session hosted");
        expect(topicCountText({ sessions: 4, upcoming: 0 })).toBe("4 sessions hosted");
        expect(topicCountText({ sessions: 1, upcoming: 1 })).toBe("1 upcoming session");
        expect(topicCountText({ sessions: 2, upcoming: 2 })).toBe("2 upcoming sessions");
        expect(topicCountText({ sessions: 6, upcoming: 2 })).toBe("4 sessions hosted, 2 upcoming");
    });
});

describe("whereSentence", () => {
    it("names areas and venues the rows state", () => {
        const stats = buildAboutStats(PUNE, UPCOMING, PAST);
        expect(stats && whereSentence(stats, "Pune")).toBe(
            "Sessions are hosted at partner studios, cafés and kitchens around Pune, in areas such as Karvenagar, Koregaon Park and Baner. Venues include Butterish Kitchen & Studio in Karvenagar, Designers Share Studio, Studio Creo, Iya's Korean Kitchen in Koregaon Park and Pottery Den Studio in Baner."
        );
    });

    it("reads each venue as one item when hosts typed the area after a comma (live rows)", () => {
        const rows = [
            workshopFixture({
                id: "mirelle",
                location: "Mirelle Patisserie",
                eventAddress: "Mirelle Patisserie, Pune Cantonment, Pune, Maharashtra 411001",
            }),
            workshopFixture({
                id: "si-nonnas",
                location: "Si Nonnas Sourdough Pizza, Kharadi",
                eventAddress: "https://maps.app.goo.gl/abc",
            }),
            workshopFixture({ id: "creo", location: "Studio Creo" }),
        ];
        const stats = buildAboutStats(PUNE, [], rows);
        expect(stats && whereSentence(stats, "Pune")).toBe(
            "Sessions are hosted at partner studios, cafés and kitchens around Pune, in areas such as Camp and Kharadi. Venues include Mirelle Patisserie in Camp, Si Nonnas Sourdough Pizza in Kharadi and Studio Creo."
        );
    });

    it("says nothing when no row names a place", () => {
        expect(whereSentence({ areas: [], venues: [] }, "Pune")).toBe("");
        expect(whereSentence({ areas: [], venues: ["Studio Creo"] }, "Pune")).toBe(
            "Sessions are hosted at partner studios, cafés and kitchens around Pune. Venues include Studio Creo."
        );
    });

    it("never contains a link", () => {
        const rows = [
            workshopFixture({
                location: "https://maps.app.goo.gl/abc",
                eventAddress: "https://maps.app.goo.gl/abc",
                date: "2026-01-01",
            }),
        ];
        const stats = buildAboutStats(PUNE, [], rows);
        expect(stats && whereSentence(stats, "Pune")).toBe("");
    });
});
