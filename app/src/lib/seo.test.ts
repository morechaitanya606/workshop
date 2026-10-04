import { describe, expect, it } from "vitest";
import type { Workshop } from "@/lib/data";
import {
    getSeoCityByName,
    getSeoCityBySlug,
    istDateTime,
    parseDurationMinutes,
    siteJsonLd,
    trimForDescription,
    workshopEventJsonLd,
    workshopSeoTitle,
} from "./seo";

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
});

describe("city lookup", () => {
    it("finds Pune by slug and by name", () => {
        expect(getSeoCityBySlug("pune")?.name).toBe("Pune");
        expect(getSeoCityBySlug("PUNE")?.name).toBe("Pune");
        expect(getSeoCityByName(" pune ")?.slug).toBe("pune");
        expect(getSeoCityBySlug("mumbai")).toBeNull();
        expect(getSeoCityByName(undefined)).toBeNull();
    });
});

describe("workshopEventJsonLd", () => {
    const workshop = {
        id: "pottery-1",
        title: "Pottery Making Experience",
        description: "Shape clay on the wheel.",
        city: "Pune",
        location: "Clay Studio, Baner",
        eventAddress: "S-4 Plot No 1, Baner Rd, Pune 411069",
        date: "2026-06-26",
        time: "11:00:00",
        duration: "2 hours",
        price: 1599,
        seatsRemaining: 0,
        hostName: "Asha",
        rating: 0,
        reviewCount: 0,
        latitude: 18.56,
        longitude: 73.78,
    } as unknown as Workshop;

    const jsonLd = workshopEventJsonLd(workshop, {
        canonicalUrl: "https://www.onlyworkshops.com/workshop/pottery-1",
        imageUrl: "https://www.onlyworkshops.com/cover.jpg",
        siteUrl: "https://www.onlyworkshops.com",
    });

    it("has a timezone-aware start and an end from the duration", () => {
        expect(jsonLd.startDate).toBe("2026-06-26T11:00:00+05:30");
        expect(jsonLd.endDate).toBe("2026-06-26T13:00:00+05:30");
    });

    it("describes an in-person event at a full address", () => {
        expect(jsonLd.eventAttendanceMode).toBe("https://schema.org/OfflineEventAttendanceMode");
        expect(jsonLd.location.address).toMatchObject({
            streetAddress: "S-4 Plot No 1, Baner Rd, Pune 411069",
            addressLocality: "Pune",
            addressRegion: "Maharashtra",
            addressCountry: "IN",
        });
        expect(jsonLd.location.geo).toMatchObject({ latitude: 18.56, longitude: 73.78 });
    });

    it("reports sold-out seats and skips an empty rating", () => {
        expect(jsonLd.offers.availability).toBe("https://schema.org/SoldOut");
        expect("aggregateRating" in jsonLd).toBe(false);
    });
});

describe("siteJsonLd", () => {
    it("names the site and links WebSite to Organization", () => {
        const graph = siteJsonLd("https://www.onlyworkshops.com")["@graph"];
        const website = graph.find((node) => node["@type"] === "WebSite");
        expect(website).toMatchObject({
            name: "Only Workshops",
            url: "https://www.onlyworkshops.com/",
            publisher: { "@id": "https://www.onlyworkshops.com/#organization" },
        });
    });
});
