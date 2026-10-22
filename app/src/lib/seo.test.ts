import { describe, expect, it } from "vitest";
import type { Workshop } from "@/lib/data";
import {
    KNOWN_PUNE_AREAS,
    SEO_CITIES,
    areaWithCity,
    displayVenue,
    firstSentence,
    formatWorkshopDate,
    formatWorkshopTime,
    getSeoCityByName,
    getSeoCityBySlug,
    istDateTime,
    parseDurationMinutes,
    postalCodeOf,
    siteJsonLd,
    splitHostNames,
    trimForDescription,
    workshopArea,
    workshopEventJsonLd,
    workshopImageUrls,
    workshopOgTitle,
    workshopSeoDescription,
    workshopSeoTitle,
} from "./seo";
import {
    SEO_TOPICS,
    getSeoTopicBySlug,
    primaryTopicFor,
    topicIsIndexable,
    topicPagePath,
    topicsForWorkshop,
    workshopMatchesTopic,
    type SeoTopic,
} from "./seo-topics";

/** The workshop page passes the workshop's own topic; mirror that in tests. */
function describeWithTopic(
    workshop: Parameters<typeof workshopSeoDescription>[0],
    todayIso: string
) {
    return workshopSeoDescription(workshop, todayIso, primaryTopicFor(workshop));
}

const SITE_URL = "https://www.onlyworkshops.com";

/** Addresses exactly as they are stored on live rows (22 Oct 2026). */
const ADDRESSES = {
    pottery:
        "Pottery Den Studio, S-4 Plot No 1 Street No 3, Baner Rd, Pallod Farms II, Pune, Maharashtra 411069",
    siNonnas:
        "SI NONNA'S, Shop No 25 Nayti Plaza Ground Floor Tower A, Kharadi, Magarpatta Rd, Haveli, Pune, Maharashtra 411014",
    kimchi: "Iya's Korean Kitchen, Lane - G, S Main Rd, Iricen Railway Colony, Koregaon Park, Pune, Maharashtra 411001",
    mirelleCamp: "Mirelle Patisserie, Above Poona Motors, Pune, Camp",
    mirelleCantonment:
        "2 Floor, 2403, EH Jaffar rd, above Poona Motors, Agarwal Colony, Pune Cantonment, Pune, Maharashtra 411001",
    mapsLink: "https://maps.app.goo.gl/563pHF9mjsF5NmfA7",
};

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

describe("parseDurationMinutes", () => {
    it("reads the formats hosts actually type", () => {
        expect(parseDurationMinutes("3 hrs")).toBe(180);
        expect(parseDurationMinutes("2 hours")).toBe(120);
        expect(parseDurationMinutes("2hrs")).toBe(120);
        expect(parseDurationMinutes("180 minutes")).toBe(180);
        expect(parseDurationMinutes("1.5 hours")).toBe(90);
        expect(parseDurationMinutes("2 hrs 30 mins")).toBe(150);
    });

    it("returns null when it cannot tell", () => {
        expect(parseDurationMinutes("")).toBeNull();
        expect(parseDurationMinutes("half day")).toBeNull();
        expect(parseDurationMinutes(undefined)).toBeNull();
    });
});

describe("istDateTime", () => {
    it("adds the IST offset and seconds", () => {
        expect(istDateTime("2026-06-21", "11:15:00")).toBe("2026-06-21T11:15:00+05:30");
        expect(istDateTime("2026-06-21", "9:05")).toBe("2026-06-21T09:05:00+05:30");
        expect(istDateTime("2026-06-21", "")).toBe("2026-06-21T10:00:00+05:30");
    });
});

describe("trimForDescription", () => {
    it("keeps short text and cuts long text at a word", () => {
        expect(trimForDescription("  Make   kimchi \n at home ")).toBe("Make kimchi at home");
        const long = "word ".repeat(60);
        const trimmed = trimForDescription(long, 50);
        expect(trimmed.length).toBeLessThanOrEqual(50);
        expect(trimmed.endsWith("word…")).toBe(true);
    });
});

describe("firstSentence", () => {
    it("stops at the first full stop, exclamation or question mark", () => {
        expect(
            firstSentence(
                "Step into the cold and discover what you're capable of with our Ice Plunge Experience! More than just an encounter."
            )
        ).toBe(
            "Step into the cold and discover what you're capable of with our Ice Plunge Experience!"
        );
        expect(firstSentence("Shape clay.\nThen glaze it.")).toBe("Shape clay.");
        expect(firstSentence("No full stop here")).toBe("No full stop here");
        expect(firstSentence(undefined)).toBe("");
    });
});

describe("workshopSeoTitle", () => {
    it("adds the city once", () => {
        expect(workshopSeoTitle({ title: "Pottery Making Experience", city: "Pune" })).toBe(
            "Pottery Making Experience in Pune | Only Workshops"
        );
        expect(workshopSeoTitle({ title: "Pune Food Walk", city: "Pune" })).toBe(
            "Pune Food Walk | Only Workshops"
        );
        expect(workshopSeoTitle({ title: "Online Sketching", city: "" })).toBe(
            "Online Sketching | Only Workshops"
        );
    });

    it("names the area from the address when one is stated", () => {
        expect(
            workshopSeoTitle({
                title: "Pottery Making Experience",
                city: "Pune",
                eventAddress: ADDRESSES.pottery,
            })
        ).toBe("Pottery Making Experience in Baner, Pune | Only Workshops");
        // "Pune Cantonment" already says Pune; with the site name it would be 63 characters.
        expect(
            workshopSeoTitle({
                title: "Health Based Mindful Baking",
                city: "Pune",
                eventAddress: ADDRESSES.mirelleCantonment,
            })
        ).toBe("Health Based Mindful Baking in Pune Cantonment");
        expect(
            workshopSeoTitle({
                title: "Ice Plunge Experience",
                city: "Pune",
                location: "Designers Share Studio",
                eventAddress: ADDRESSES.mapsLink,
            })
        ).toBe("Ice Plunge Experience in Pune | Only Workshops");
    });

    it("stays within 60 characters: drops the site name first, then the area", () => {
        // 67 characters live today: the suffix goes.
        const grazing = workshopSeoTitle({
            title: "Grazing Table & Charcuterie Board Workshop",
            city: "Pune",
        });
        expect(grazing).toBe("Grazing Table & Charcuterie Board Workshop in Pune");
        expect(grazing.length).toBeLessThanOrEqual(60);

        // With the area it would be 62 characters even without the suffix.
        expect(
            workshopSeoTitle({
                title: "Grazing Table & Charcuterie Board Workshop",
                city: "Pune",
                eventAddress: "Butterish Kitchen & Studio, Karvenagar, Pune 411052",
            })
        ).toBe("Grazing Table & Charcuterie Board Workshop in Pune");

        // The area fits once the suffix is dropped.
        expect(
            workshopSeoTitle({
                title: "Sourdough Pizza Making Workshop",
                city: "Pune",
                eventAddress: ADDRESSES.siNonnas,
            })
        ).toBe("Sourdough Pizza Making Workshop in Kharadi, Pune");
    });
});

describe("workshopOgTitle", () => {
    it("has the place but never the site name or a length cut", () => {
        expect(
            workshopOgTitle({
                title: "Grazing Table & Charcuterie Board Workshop",
                city: "Pune",
                eventAddress: "Butterish Kitchen & Studio, Karvenagar, Pune 411052",
            })
        ).toBe("Grazing Table & Charcuterie Board Workshop in Karvenagar, Pune");
        expect(workshopOgTitle({ title: "Pune Food Walk", city: "Pune" })).toBe("Pune Food Walk");
    });
});

describe("city lookup", () => {
    it("finds Pune by slug and by name", () => {
        expect(getSeoCityBySlug("pune")?.name).toBe("Pune");
        expect(getSeoCityBySlug("PUNE")?.name).toBe("Pune");
        expect(getSeoCityByName(" pune ")?.slug).toBe("pune");
        expect(getSeoCityBySlug("mumbai")).toBeNull();
        expect(getSeoCityByName(undefined)).toBeNull();
    });

    it("keeps the city title short enough for Google", () => {
        for (const city of SEO_CITIES) {
            expect(city.metaTitle.length).toBeLessThanOrEqual(60);
            expect(city.metaTitle).toContain(city.name);
            expect(city.metaDescription.length).toBeLessThanOrEqual(160);
            expect(city.intro.join(" ")).not.toMatch(/\d/);
        }
    });
});

describe("SEO_TOPICS catalogue", () => {
    const slugs = SEO_TOPICS.map((topic) => topic.slug);

    it("has unique, URL-safe slugs", () => {
        expect(new Set(slugs).size).toBe(slugs.length);
        for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    });

    it.each(SEO_TOPICS.map((topic) => [topic.slug, topic] as const))(
        "%s has a short title, a snippet-sized description and 150-250 words of intro",
        (_slug, topic) => {
            expect(topic.metaTitle.length).toBeLessThanOrEqual(60);
            expect(topic.metaTitle).toContain("Pune");
            expect(topic.h1).toContain("Pune");
            expect(topic.metaDescription.length).toBeGreaterThanOrEqual(100);
            expect(topic.metaDescription.length).toBeLessThanOrEqual(160);
            expect(topic.metaDescription).toContain("Pune");

            const words = topic.intro.join(" ").split(/\s+/).length;
            expect(words).toBeGreaterThanOrEqual(150);
            expect(words).toBeLessThanOrEqual(250);
            // Evergreen copy: no counts, prices or dates that go stale.
            expect(topic.intro.join(" ")).not.toMatch(/\d/);
            // Reviews are switched off site-wide.
            expect(topic.intro.join(" ")).not.toMatch(/\b(?:rating|rated|reviews?|stars?)\b/i);
        }
    );

    it("links only to topics that exist, never to itself", () => {
        for (const topic of SEO_TOPICS) {
            for (const slug of [...topic.related, ...(topic.includeTopics ?? [])]) {
                expect(getSeoTopicBySlug(slug)).not.toBeNull();
                expect(slug).not.toBe(topic.slug);
            }
        }
    });

    it("lists specific topics before the broad baking and cooking hubs", () => {
        expect(slugs.slice(-2)).toEqual(["baking", "cooking-classes"]);
    });

    it("uses stateless title patterns", () => {
        // A /g pattern keeps lastIndex between test() calls and would skip every other match.
        for (const topic of SEO_TOPICS) expect(topic.titlePattern.global).toBe(false);
    });

    it("flags the footer candidates", () => {
        expect(SEO_TOPICS.filter((topic) => topic.footer).map((topic) => topic.slug)).toEqual([
            "chocolate-making",
            "ice-plunge",
            "pottery",
            "terrarium",
            "baking",
        ]);
    });
});

describe("getSeoTopicBySlug and topicPagePath", () => {
    it("finds a topic by slug in any case", () => {
        expect(getSeoTopicBySlug("ice-plunge")?.name).toBe("Ice Plunge");
        expect(getSeoTopicBySlug(" Macaron ")?.slug).toBe("macaron");
        expect(getSeoTopicBySlug("foo")).toBeNull();
        expect(getSeoTopicBySlug(undefined)).toBeNull();
    });

    it("builds the activity URL under the city", () => {
        const city = getSeoCityBySlug("pune")!;
        const topic = getSeoTopicBySlug("chocolate-making")!;
        expect(topicPagePath(city, topic)).toBe("/workshops/pune/chocolate-making");
    });
});

describe("topic matching on the live catalogue", () => {
    // [id, title, category] as stored on 22 Oct 2026, typos included.
    const live: [string, string, string, string[]][] = [
        [
            "ice-plunge-experience-1792388018842",
            "Ice Plunge Experience",
            "Wellness",
            ["ice-plunge"],
        ],
        [
            "french-macron-workshop-1792131553786",
            "French Macron Workshop",
            "Food & Drink",
            ["macaron", "baking", "cooking-classes"],
        ],
        [
            "choclate-making-workshop-1792392081199",
            "Chocolate Making Workshop",
            "Food & Drink",
            ["chocolate-making", "cooking-classes"],
        ],
        [
            "grazing-table-charcuterie-board-1792134563051",
            "Grazing Table & Charcuterie Board Workshop",
            "Food & Drink",
            ["charcuterie-grazing-table", "cooking-classes"],
        ],
        [
            "terrarium-making-experience-1792148504838",
            "Terrarium Making Experience",
            "Arts & Crafts",
            ["terrarium"],
        ],
        [
            "sourdough-pizza-workshop-1792153529040",
            "Sourdough Pizza Workshop",
            "Food & Drink",
            ["sourdough", "baking", "cooking-classes"],
        ],
        [
            "sourdough-starter-workshop-1792146579362",
            "Sourdough Starter Workshop",
            "Food & Drink",
            ["sourdough", "baking", "cooking-classes"],
        ],
        // Filed as Arts & Crafts: the title still makes it baking, and so a cooking class.
        [
            "babka-foccacia-workshop-1792135739899",
            "Babka & Foccacia Workshop",
            "Arts & Crafts",
            ["baking", "cooking-classes"],
        ],
        [
            "korean-kimchi-making-experience-1782727209062",
            "Korean Kimchi Making Experience",
            "Food & Drink",
            ["cooking-classes"],
        ],
        [
            "pottery-making-experience-1782728725150",
            "Pottery Making Experience",
            "Pottery",
            ["pottery"],
        ],
        // Filed as Wellness.
        [
            "health-based-mindful-baking-1781515278493",
            "Health Based Mindful Baking",
            "Wellness",
            ["baking", "cooking-classes"],
        ],
        [
            "asian-bread-making-workshop-1782730741984",
            "Asian Bread Making Workshop",
            "Food & Drink",
            ["baking", "cooking-classes"],
        ],
        [
            "cookies-muffins-workshop-1782890717220",
            "Cookies & Muffins Workshop",
            "Food & Drink",
            ["baking", "cooking-classes"],
        ],
        [
            "cookies-cakes-workshop-1782892188660",
            "Cookies & Cakes Workshop",
            "Food & Drink",
            ["baking", "cooking-classes"],
        ],
        ["summer-family-retreat", "Summer Family Retreat", "", []],
    ];

    it.each(live)("%s", (id, title, category, expected) => {
        const topics = topicsForWorkshop({ id, title, category });
        expect(topics.map((topic) => topic.slug)).toEqual(expected);
        expect(primaryTopicFor({ id, title, category })?.slug ?? null).toBe(expected[0] ?? null);
    });

    it("tolerates the misspellings and the correct spellings alike", () => {
        const slugsOf = (title: string) =>
            topicsForWorkshop({ id: "x", title, category: "" }).map((topic) => topic.slug);
        expect(slugsOf("Choclate Making Workshop")).toContain("chocolate-making");
        expect(slugsOf("French Macaron Workshop")).toContain("macaron");
        expect(slugsOf("French Macron Workshop")).toContain("macaron");
        expect(slugsOf("Babka & Focaccia Workshop")).toContain("baking");
        expect(slugsOf("Ice Bath Experience")).toEqual(["ice-plunge"]);
        expect(slugsOf("Cold Plunge Morning")).toEqual(["ice-plunge"]);
    });

    it("matches on the title, not the description or a loose word", () => {
        // The babka description mentions chocolate; only the title is read.
        expect(
            topicsForWorkshop({ id: "x", title: "Chocolate Babka Workshop", category: "" }).map(
                (topic) => topic.slug
            )
        ).toEqual(["baking", "cooking-classes"]);
        const terrarium = { id: "x", title: "Terrarium Making Experience", category: "" };
        expect(workshopMatchesTopic(terrarium, getSeoTopicBySlug("baking")!)).toBe(false);
        expect(
            topicsForWorkshop({ id: "x", title: "Polymer Clay Earrings", category: "" })
        ).toEqual([]);
        expect(
            workshopMatchesTopic(
                { id: "x", title: "Cookies & Cakes", category: "" },
                getSeoTopicBySlug("cooking-classes")!
            )
        ).toBe(true);
    });

    it("matches the category in any case", () => {
        const kimchi = { id: "x", title: "Korean Kimchi", category: "food & drink" };
        expect(workshopMatchesTopic(kimchi, getSeoTopicBySlug("cooking-classes")!)).toBe(true);
        const mug = { id: "x", title: "Mug Making", category: " pottery " };
        expect(primaryTopicFor(mug)?.slug).toBe("pottery");
    });

    it("applies excludeIds before includeIds and the pattern", () => {
        const base = getSeoTopicBySlug("pottery")!;
        const topic: SeoTopic = { ...base, includeIds: ["odd-one"], excludeIds: ["wrong-one"] };
        expect(workshopMatchesTopic({ id: "odd-one", title: "Mug Day", category: "" }, topic)).toBe(
            true
        );
        expect(
            workshopMatchesTopic({ id: "wrong-one", title: "Pottery Day", category: "" }, topic)
        ).toBe(false);
        const both: SeoTopic = { ...base, includeIds: ["x"], excludeIds: ["x"] };
        expect(workshopMatchesTopic({ id: "x", title: "Pottery", category: "" }, both)).toBe(false);
    });

    it("does not loop when a hub includes itself", () => {
        const a: SeoTopic = {
            ...getSeoTopicBySlug("cooking-classes")!,
            titlePattern: /^$/,
            categories: [],
            includeTopics: ["cooking-classes"],
        };
        expect(workshopMatchesTopic({ id: "x", title: "Knitting", category: "" }, a)).toBe(false);
    });
});

describe("topicIsIndexable", () => {
    it("indexes a topic with a bookable date, two sessions or three photos", () => {
        expect(topicIsIndexable({ upcoming: 1, total: 1, photos: 0 })).toBe(true);
        expect(topicIsIndexable({ upcoming: 0, total: 2, photos: 0 })).toBe(true);
        expect(topicIsIndexable({ upcoming: 0, total: 1, photos: 3 })).toBe(true);
    });

    it("keeps a single past session with few photos out of the index", () => {
        expect(topicIsIndexable({ upcoming: 0, total: 1, photos: 2 })).toBe(false);
        expect(topicIsIndexable({ upcoming: 0, total: 0, photos: 0 })).toBe(false);
    });
});

describe("workshopArea", () => {
    it("reads the area the live addresses state", () => {
        expect(workshopArea({ eventAddress: ADDRESSES.pottery })).toBe("Baner");
        expect(workshopArea({ eventAddress: ADDRESSES.kimchi })).toBe("Koregaon Park");
        expect(workshopArea({ eventAddress: ADDRESSES.mirelleCamp })).toBe("Camp");
        expect(workshopArea({ eventAddress: ADDRESSES.mirelleCantonment })).toBe("Pune Cantonment");
    });

    it("prefers the area over a road named after another one", () => {
        expect(workshopArea({ eventAddress: ADDRESSES.siNonnas })).toBe("Kharadi");
    });

    it("never reads a pasted link, and falls back to the venue text", () => {
        expect(workshopArea({ eventAddress: ADDRESSES.mapsLink })).toBeNull();
        expect(
            workshopArea({ eventAddress: ADDRESSES.mapsLink, location: "Studio Creo" })
        ).toBeNull();
        expect(
            workshopArea({
                eventAddress: ADDRESSES.mapsLink,
                location: "Si Nonnas Sourdough Pizza, Kharadi",
            })
        ).toBe("Kharadi");
        expect(workshopArea({ location: "https://maps.app.goo.gl/UXEiDjhdRibZegzu5" })).toBeNull();
        expect(workshopArea({})).toBeNull();
    });

    it("accepts common spellings and returns the listed name", () => {
        expect(workshopArea({ eventAddress: "Flat 2, Karve Nagar, Pune 411052" })).toBe(
            "Karvenagar"
        );
        expect(workshopArea({ eventAddress: "Plot 9, Kalyaninagar, Pune" })).toBe("Kalyani Nagar");
        expect(workshopArea({ eventAddress: "Lane 5, koregaon park" })).toBe("Koregaon Park");
        expect(workshopArea({ eventAddress: "F.C. Road, Pune" })).toBe("FC Road");
        expect(workshopArea({ eventAddress: "Wakad" })).toBe("Wakad");
    });

    it("does not take an ordinary word or part of a name for an area", () => {
        expect(workshopArea({ location: "Fitness Boot Camp" })).toBeNull();
        expect(workshopArea({ location: "Boot Camp Studio, Baner" })).toBe("Baner");
        expect(workshopArea({ location: "Banerjee Bakery" })).toBeNull();
    });

    it("lists each area once", () => {
        expect(new Set(KNOWN_PUNE_AREAS).size).toBe(KNOWN_PUNE_AREAS.length);
    });
});

describe("postalCodeOf", () => {
    it("finds a PIN code in an address", () => {
        expect(postalCodeOf("S-4 Plot No 1, Baner Rd, Pune, Maharashtra 411069")).toBe("411069");
        expect(postalCodeOf("Karve Nagar, Pune 411 052")).toBe("411052");
        expect(postalCodeOf(ADDRESSES.siNonnas)).toBe("411014");
    });

    it("returns null for links, missing codes and other numbers", () => {
        expect(postalCodeOf(ADDRESSES.mapsLink)).toBeNull();
        expect(postalCodeOf(ADDRESSES.mirelleCamp)).toBeNull();
        expect(postalCodeOf("Call 4110691234")).toBeNull();
        expect(postalCodeOf(undefined)).toBeNull();
    });
});

describe("displayVenue and areaWithCity", () => {
    it("hides a pasted link but keeps a real venue", () => {
        expect(displayVenue({ location: "https://maps.app.goo.gl/UXEiDjhdRibZegzu5" })).toBe("");
        expect(displayVenue({ location: "  Mirelle Patisserie " })).toBe("Mirelle Patisserie");
        expect(displayVenue({})).toBe("");
    });

    it("adds the city unless the area already names it", () => {
        expect(areaWithCity("Baner")).toBe("Baner, Pune");
        expect(areaWithCity("Pune Cantonment")).toBe("Pune Cantonment");
        expect(areaWithCity(null)).toBe("Pune");
    });
});

describe("formatWorkshopDate and formatWorkshopTime", () => {
    it("prints the IST calendar date with the year", () => {
        expect(formatWorkshopDate("2026-10-24")).toBe("Sat, 24 Oct 2026");
        expect(formatWorkshopDate("2026-01-01")).toBe("Thu, 1 Jan 2026");
        expect(formatWorkshopDate("")).toBe("");
        expect(formatWorkshopDate("soon")).toBe("");
    });

    it("prints a 12-hour time", () => {
        expect(formatWorkshopTime("09:00:00")).toBe("9:00 am");
        expect(formatWorkshopTime("15:30")).toBe("3:30 pm");
        expect(formatWorkshopTime("12:00")).toBe("12:00 pm");
        expect(formatWorkshopTime("00:05")).toBe("12:05 am");
        expect(formatWorkshopTime("")).toBe("");
    });
});

describe("workshopSeoDescription", () => {
    const today = "2026-10-22";

    it("says what, where, when and the price for an upcoming workshop", () => {
        const description = workshopSeoDescription(
            workshopFixture({
                title: "Ice Plunge Experience",
                category: "Wellness",
                location: "Designers Share Studio",
                eventAddress: ADDRESSES.mapsLink,
                date: "2026-10-24",
                time: "09:00:00",
                price: 1920,
                description:
                    "Step into the cold and discover what you're capable of with our Ice Plunge Experience! More text.",
            }),
            today
        );
        expect(
            description.startsWith(
                "Ice Plunge Experience in Pune on Sat, 24 Oct 2026, 9:00 am at Designers Share Studio. ₹1,920 per person incl. GST. Step into the cold"
            )
        ).toBe(true);
        expect(description).not.toContain("maps.app.goo.gl");
        expect(description.length).toBeLessThanOrEqual(155);
    });

    it("names the area and leaves out a venue that is a pasted link", () => {
        const description = workshopSeoDescription(
            workshopFixture({
                title: "Babka & Foccacia Workshop",
                location: "https://maps.app.goo.gl/UXEiDjhdRibZegzu5",
                eventAddress: ADDRESSES.mirelleCamp,
                date: "2026-10-25",
                time: "11:00:00",
                price: 1999,
                description: "Bake babka.",
            }),
            today
        );
        expect(description).toBe(
            "Babka & Foccacia Workshop in Camp, Pune on Sun, 25 Oct 2026, 11:00 am. ₹1,999 per person incl. GST. Bake babka."
        );
    });

    it("leaves out a missing price instead of calling it free", () => {
        const description = workshopSeoDescription(
            workshopFixture({ title: "Open Studio", price: 0, date: "2026-10-30", time: "" }),
            today
        );
        expect(description).toBe("Open Studio in Pune on Fri, 30 Oct 2026.");
    });

    it("points a past workshop at more sessions of its topic", () => {
        expect(
            describeWithTopic(
                workshopFixture({
                    title: "Pottery Making Experience",
                    category: "Pottery",
                    location:
                        "S-4 Plot No 1 Street No 3, Baner Rd, Pallod Farms II, Pune, Maharashtra 411069",
                    eventAddress: ADDRESSES.pottery,
                    date: "2026-06-26",
                    galleryImages: ["/a.jpg", "/b.jpg"],
                    description:
                        "There's something magical about turning a lump of clay into something you made with your own hands. More.",
                }),
                today
            )
        ).toBe(
            "Pottery Making Experience in Baner, Pune (Fri, 26 Jun 2026). See photos from the session and find more pottery workshops in Pune."
        );

        expect(
            describeWithTopic(
                workshopFixture({
                    title: "Health Based Mindful Baking",
                    category: "Wellness",
                    location: "Mirelle Patisserie",
                    eventAddress: ADDRESSES.mirelleCantonment,
                    date: "2026-06-21",
                    description: "Bake millet cookies.",
                }),
                today
            )
        ).toBe(
            "Health Based Mindful Baking at Mirelle Patisserie, Pune Cantonment (Sun, 21 Jun 2026). Find more baking workshops in Pune. Bake millet cookies."
        );
    });

    it("does not repeat an area the venue already names", () => {
        const description = describeWithTopic(
            workshopFixture({
                title: "Sourdough Pizza Making Workshop",
                category: "Food & Drink",
                location: "Si Nonnas Sourdough Pizza, Kharadi",
                eventAddress: ADDRESSES.siNonnas,
                date: "2026-06-21",
            }),
            today
        );
        expect(description).toBe(
            "Sourdough Pizza Making Workshop at Si Nonnas Sourdough Pizza, Kharadi, Pune (Sun, 21 Jun 2026). Find more sourdough workshops in Pune."
        );
    });

    it("uses the topic it is given, or plain workshops without one", () => {
        const past = workshopFixture({ title: "Summer Family Retreat", date: "2026-05-09" });
        expect(workshopSeoDescription(past, today)).toBe(
            "Summer Family Retreat in Pune (Sat, 9 May 2026). Find upcoming workshops in Pune."
        );
        expect(workshopSeoDescription(past, today, getSeoTopicBySlug("terrarium"))).toContain(
            "more terrarium workshops in Pune"
        );
        const kimchi = workshopFixture({
            title: "Korean Kimchi Making Experience",
            category: "Food & Drink",
            date: "2026-06-28",
        });
        expect(workshopSeoDescription(kimchi, today, null)).toContain("upcoming workshops in Pune");
    });
});

describe("splitHostNames", () => {
    it("splits co-hosts on &, commas and 'and'", () => {
        expect(splitHostNames("Chef Dhanshri & Chef Krina")).toEqual([
            "Chef Dhanshri",
            "Chef Krina",
        ]);
        expect(splitHostNames("Chef Krina and Chef Dhanshree")).toEqual([
            "Chef Krina",
            "Chef Dhanshree",
        ]);
        expect(splitHostNames("A, B & C")).toEqual(["A", "B", "C"]);
        expect(splitHostNames("Anand Rao")).toEqual(["Anand Rao"]);
        expect(splitHostNames("")).toEqual([]);
    });
});

describe("workshopImageUrls", () => {
    it("puts the cover first and skips blanks and duplicates", () => {
        const toAbsolute = (path: string) =>
            path.startsWith("http") ? path : `${SITE_URL}${path}`;
        expect(
            workshopImageUrls(
                {
                    coverImage: "/cover.jpg",
                    galleryImages: [
                        "/cover.jpg",
                        " ",
                        "https://cdn.example/1.jpg",
                        "https://cdn.example/2.jpg",
                        "https://cdn.example/3.jpg",
                        "https://cdn.example/4.jpg",
                    ],
                },
                toAbsolute
            )
        ).toEqual([
            `${SITE_URL}/cover.jpg`,
            "https://cdn.example/1.jpg",
            "https://cdn.example/2.jpg",
            "https://cdn.example/3.jpg",
        ]);
    });
});

describe("workshopEventJsonLd", () => {
    const workshop = workshopFixture({
        id: "pottery-1",
        title: "Pottery Making Experience",
        description: "Shape clay on the wheel.",
        location: "Clay Studio, Baner",
        eventAddress: "S-4 Plot No 1, Baner Rd, Pune 411069",
        date: "2026-06-26",
        time: "11:00:00",
        duration: "2 hours",
        price: 1599,
        seatsRemaining: 0,
        hostName: "Asha",
        latitude: 18.56,
        longitude: 73.78,
        createdAt: "2026-06-15T09:21:25.299319+00:00",
    });

    const urls = {
        canonicalUrl: `${SITE_URL}/workshop/pottery-1`,
        imageUrls: [`${SITE_URL}/cover.jpg`, `${SITE_URL}/gallery-1.jpg`],
        siteUrl: SITE_URL,
    };
    const jsonLd = workshopEventJsonLd(workshop, urls);

    it("has a timezone-aware start and an end from the duration", () => {
        expect(jsonLd.startDate).toBe("2026-06-26T11:00:00+05:30");
        expect(jsonLd.endDate).toBe("2026-06-26T13:00:00+05:30");
    });

    it("identifies the event by its page", () => {
        expect(jsonLd.url).toBe(`${SITE_URL}/workshop/pottery-1`);
        expect(jsonLd["@id"]).toBe(`${SITE_URL}/workshop/pottery-1#event`);
        expect(jsonLd.offers.url).toBe(`${SITE_URL}/workshop/pottery-1`);
    });

    it("describes an in-person event at a full address", () => {
        expect(jsonLd.eventAttendanceMode).toBe("https://schema.org/OfflineEventAttendanceMode");
        expect(jsonLd.location.name).toBe("Clay Studio, Baner");
        expect(jsonLd.location.address).toMatchObject({
            streetAddress: "S-4 Plot No 1, Baner Rd, Pune 411069",
            addressLocality: "Pune",
            postalCode: "411069",
            addressRegion: "Maharashtra",
            addressCountry: "IN",
        });
        expect(jsonLd.location.geo).toMatchObject({ latitude: 18.56, longitude: 73.78 });
    });

    it("lists every image it is given", () => {
        expect(jsonLd.image).toEqual([`${SITE_URL}/cover.jpg`, `${SITE_URL}/gallery-1.jpg`]);
        // Older callers that pass one imageUrl still get it.
        const legacy = workshopEventJsonLd(workshop, {
            canonicalUrl: urls.canonicalUrl,
            imageUrl: `${SITE_URL}/cover.jpg`,
            siteUrl: SITE_URL,
        });
        expect(legacy.image).toEqual([`${SITE_URL}/cover.jpg`]);
    });

    it("reports sold-out seats and skips an empty rating", () => {
        expect(jsonLd.offers.availability).toBe("https://schema.org/SoldOut");
        expect("aggregateRating" in jsonLd).toBe(false);
        expect("review" in jsonLd).toBe(false);
    });

    it("dates the offer from when the workshop was listed, in IST", () => {
        expect(jsonLd.offers.validFrom).toBe("2026-06-15T14:51:25+05:30");
        const unlisted = workshopEventJsonLd({ ...workshop, createdAt: undefined }, urls);
        expect("validFrom" in unlisted.offers).toBe(false);
    });

    it("links the organizer to the site's Organization", () => {
        expect(jsonLd.organizer).toEqual({
            "@type": "Organization",
            "@id": `${SITE_URL}/#organization`,
            name: "Only Workshops",
            url: `${SITE_URL}/`,
        });
        const organization = siteJsonLd(`${SITE_URL}/`)["@graph"].find(
            (node) => node["@type"] === "Organization"
        );
        expect(organization?.["@id"]).toBe(jsonLd.organizer["@id"]);
    });

    it("has one performer per host", () => {
        expect(jsonLd.performer).toEqual({ "@type": "Person", name: "Asha" });
        const duo = workshopEventJsonLd(
            { ...workshop, hostName: "Chef Archit & Chef Avanti" },
            urls
        );
        expect(duo.performer).toEqual([
            { "@type": "Person", name: "Chef Archit" },
            { "@type": "Person", name: "Chef Avanti" },
        ]);
        const noHost = workshopEventJsonLd({ ...workshop, hostName: "" }, urls);
        expect("performer" in noHost).toBe(false);
    });

    it("never sends a pasted Maps link, or the venue name, as the street address", () => {
        const withLink = workshopEventJsonLd(
            { ...workshop, eventAddress: "https://maps.app.goo.gl/UXEiDjhdRibZegzu5" },
            urls
        );
        expect("streetAddress" in withLink.location.address).toBe(false);
        expect("postalCode" in withLink.location.address).toBe(false);
        expect(withLink.location.name).toBe("Clay Studio, Baner");
    });

    it("names the place even when the venue field is a link", () => {
        const linkedVenue = workshopEventJsonLd(
            { ...workshop, location: "https://maps.app.goo.gl/UXEiDjhdRibZegzu5" },
            urls
        );
        expect(linkedVenue.location.name).toBe("Pottery Making Experience venue");
        expect(JSON.stringify(linkedVenue)).not.toContain("maps.app.goo.gl");
    });
});

describe("siteJsonLd", () => {
    const graph = siteJsonLd(SITE_URL)["@graph"];

    it("names the site and links WebSite to Organization", () => {
        const website = graph.find((node) => node["@type"] === "WebSite");
        expect(website).toMatchObject({
            name: "Only Workshops",
            url: "https://www.onlyworkshops.com/",
            publisher: { "@id": "https://www.onlyworkshops.com/#organization" },
        });
    });

    it("gives the Organization a city-level address and no street", () => {
        const organization = graph.find((node) => node["@type"] === "Organization");
        expect(organization).toMatchObject({
            address: {
                "@type": "PostalAddress",
                addressLocality: "Pune",
                addressRegion: "Maharashtra",
                addressCountry: "IN",
            },
        });
        expect(JSON.stringify(organization)).not.toContain("streetAddress");
    });
});

describe("topic pages vs session pages", () => {
    it("never gives a session page the same <title> as an activity page", () => {
        const liveTitles = [
            "Chocolate Making Workshop",
            "French Macron Workshop",
            "Ice Plunge Experience",
            "Grazing Table & Charcuterie Board Workshop",
            "Terrarium Making Experience",
            "Pottery Making Experience",
            "Sourdough Pizza Workshop",
            "Babka & Foccacia Workshop",
            "Korean Kimchi Making Experience",
        ];
        const topicTitles = new Set(SEO_TOPICS.map((topic) => topic.metaTitle));
        for (const title of liveTitles) {
            expect(topicTitles.has(workshopSeoTitle({ title, city: "Pune" }))).toBe(false);
        }
    });
});
