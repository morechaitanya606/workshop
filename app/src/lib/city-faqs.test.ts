import { describe, expect, it } from "vitest";
import {
    areasOf,
    buildLandingFaqs,
    faqPageJsonLd,
    joinList,
    range,
    topicAreaSentence,
    topicGroup,
    topicGroups,
} from "./city-faqs";
import type { Workshop } from "@/lib/data";
import { SEO_CITIES } from "@/lib/seo";
import { SEO_TOPICS, getSeoTopicBySlug, type SeoTopic } from "@/lib/seo-topics";

const PUNE = SEO_CITIES[0];

function topic(slug: string): SeoTopic {
    const found = getSeoTopicBySlug(slug);
    if (!found) throw new Error(`missing topic ${slug}`);
    return found;
}

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

/** Shapes of live rows (22 Oct 2026); addresses as stored. */
const icePlunge = workshopFixture({
    id: "ice-plunge-experience",
    title: "Ice Plunge Experience",
    category: "Wellness",
    price: 1920,
    duration: "120 minutes",
    date: "2026-10-24",
    location: "Designers Share Studio",
    eventAddress: "https://maps.app.goo.gl/563pHF9mjsF5NmfA7",
    maxSeats: 12,
});
const chocolate = workshopFixture({
    id: "choclate-making-workshop",
    title: "Chocolate Making Workshop",
    category: "Food & Drink",
    price: 3500,
    duration: "5 hours",
    date: "2026-10-25",
    location: "Studio Creo",
    eventAddress: "https://maps.app.goo.gl/abc",
});
const pottery = workshopFixture({
    id: "pottery-making-experience",
    title: "Pottery Making Experience",
    category: "Pottery",
    price: 1599,
    date: "2026-06-26",
    location: "Pottery Den Studio",
    eventAddress:
        "Pottery Den Studio, S-4 Plot No 1 Street No 3, Baner Rd, Pallod Farms II, Pune, Maharashtra 411069",
    galleryImages: ["/a.jpg", "/b.jpg", "/c.jpg", "/d.jpg"],
});
const terrarium = workshopFixture({
    id: "terrarium-making-experience",
    title: "Terrarium Making Experience",
    category: "Arts & Crafts",
    date: "2026-10-18",
    location: "Brickwall Cafe",
    eventAddress: "https://maps.app.goo.gl/xyz",
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
    duration: "3 hrs",
});
const cookiesCakes = workshopFixture({
    id: "cookies-cakes-workshop",
    title: "Cookies & Cakes Workshop",
    category: "Food & Drink",
    date: "2026-04-03",
    location: "Butterish",
    eventAddress: "Butterish, Karvenagar, Pune, Maharashtra 411052",
    duration: "3 hrs",
});

const UPCOMING = [icePlunge, chocolate];
const PAST = [terrarium, kimchi, pottery, cookiesMuffins, cookiesCakes];

describe("joinList and range", () => {
    it("joins with commas and a final 'and'", () => {
        expect(joinList([])).toBe("");
        expect(joinList(["Baner"])).toBe("Baner");
        expect(joinList(["Baner", "Kharadi", "Camp"])).toBe("Baner, Kharadi and Camp");
    });

    it("ignores blanks and zeros", () => {
        expect(range([0, 1999, 3500, Number.NaN])).toEqual({ min: 1999, max: 3500 });
        expect(range([0])).toBeNull();
    });
});

describe("topicGroup", () => {
    it("counts sessions and past photos for the thin-content rule", () => {
        const ice = topicGroup(topic("ice-plunge"), UPCOMING, PAST);
        expect(ice.upcoming.map((w) => w.id)).toEqual(["ice-plunge-experience"]);
        expect(ice.indexable).toBe(true);

        const potteryGroup = topicGroup(topic("pottery"), UPCOMING, PAST);
        expect(potteryGroup.counts).toEqual({ upcoming: 0, total: 1, photos: 4 });
        expect(potteryGroup.indexable).toBe(true);

        const terrariumGroup = topicGroup(topic("terrarium"), UPCOMING, PAST);
        expect(terrariumGroup.counts).toEqual({ upcoming: 0, total: 1, photos: 0 });
        expect(terrariumGroup.indexable).toBe(false);
    });

    it("keeps hub pages fed by the specific topics", () => {
        const cooking = topicGroup(topic("cooking-classes"), UPCOMING, PAST);
        expect(cooking.upcoming.map((w) => w.id)).toEqual(["choclate-making-workshop"]);
        expect(cooking.past.map((w) => w.id)).toEqual([
            "korean-kimchi-making-experience",
            "cookies-muffins-workshop",
            "cookies-cakes-workshop",
        ]);
        expect(topicGroups(UPCOMING, PAST)).toHaveLength(SEO_TOPICS.length);
    });
});

describe("areas", () => {
    it("reads areas only from text addresses, most frequent first", () => {
        expect(areasOf([...UPCOMING, ...PAST])).toEqual(["Karvenagar", "Koregaon Park", "Baner"]);
    });

    it("says 'including' when some rows have no readable area", () => {
        expect(topicAreaSentence([], [pottery])).toBe("Past sessions were hosted in Baner.");
        expect(topicAreaSentence([icePlunge], [pottery, terrarium])).toBe(
            "Past sessions were hosted in areas including Baner."
        );
        expect(topicAreaSentence([icePlunge], [terrarium])).toBe("");
    });
});

describe("buildLandingFaqs", () => {
    it("answers the city questions from topics and areas, not coarse categories", () => {
        const faqs = buildLandingFaqs({ city: PUNE, upcoming: UPCOMING, past: PAST });
        const kinds = faqs.find((faq) => faq.question.startsWith("What kind"));
        expect(kinds?.answer).toBe(
            "Hands-on sessions led by local hosts, such as chocolate making, ice plunge, pottery, terrarium and baking workshops."
        );
        const where = faqs.find((faq) => faq.question.startsWith("Where"));
        expect(where?.answer).toContain("in areas such as Karvenagar, Koregaon Park and Baner.");
        const price = faqs.find((faq) => faq.question.startsWith("How much"));
        expect(price?.answer).toBe(
            "Workshops have ranged from ₹1,599 to ₹3,500 per person, incl. GST. Each workshop page shows the full price before you pay."
        );
        const length = faqs.find((faq) => faq.question.startsWith("How long"));
        expect(length?.answer).toContain("Workshops have run from about 2 to 5 hours.");
    });

    it("lists each venue with its area on a topic page, without repeating a venue", () => {
        const baking = topic("baking");
        const group = topicGroup(baking, UPCOMING, PAST);
        const faqs = buildLandingFaqs({
            city: PUNE,
            upcoming: group.upcoming,
            past: group.past,
            topic: baking,
        });
        expect(faqs[0]).toEqual({
            question: "Where do baking workshops in Pune take place?",
            answer: "Past sessions were hosted at Butterish Kitchen & Studio in Karvenagar. The exact venue and address are on each workshop's page.",
        });
        expect(faqs.some((faq) => faq.question.startsWith("What kind"))).toBe(false);
    });

    it("uses the present tense while a topic has only upcoming dates", () => {
        const ice = topic("ice-plunge");
        const faqs = buildLandingFaqs({
            city: PUNE,
            upcoming: [icePlunge],
            past: [],
            whatsappUrl: "https://chat.whatsapp.com/example",
            topic: ice,
        });
        const questions = faqs.map((faq) => faq.question);
        expect(questions).toContain("How much does an ice plunge workshop in Pune cost?");
        expect(questions).toContain("How do I hear about new ice plunge dates?");
        expect(faqs.find((faq) => faq.question.startsWith("Where"))?.answer).toBe(
            "Upcoming sessions are at Designers Share Studio. The exact venue and address are on each workshop's page."
        );
        expect(faqs.find((faq) => faq.question.startsWith("How much"))?.answer).toMatch(
            /^Sessions are ₹1,920 per person, incl\. GST\./
        );
        expect(faqs.find((faq) => faq.question.startsWith("How long"))?.answer).toMatch(
            /^Sessions run for about 2 hours\./
        );
        expect(faqs.find((faq) => faq.question.startsWith("How big"))?.answer).toMatch(
            /^Sessions have room for up to 12 people\./
        );
        // The topic's own Q&As are included.
        expect(questions).toContain(ice.faqs?.[0]?.question);
    });

    it("never mentions ratings or reviews", () => {
        const all = [
            ...buildLandingFaqs({ city: PUNE, upcoming: UPCOMING, past: PAST }),
            ...buildLandingFaqs({
                city: PUNE,
                upcoming: UPCOMING,
                past: PAST,
                topic: topic("cooking-classes"),
            }),
        ];
        const json = JSON.stringify(faqPageJsonLd(all));
        expect(json).not.toMatch(/rating|review/i);
    });
});
