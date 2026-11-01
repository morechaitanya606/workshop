// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Workshop } from "@/lib/data";
import { suggestedAlternatives } from "./workshop-suggestions";

const TODAY = "2026-10-24";

function workshop(overrides: Partial<Workshop>): Workshop {
    return {
        id: "w-1",
        title: "Workshop",
        description: "",
        category: "Pottery",
        price: 2000,
        location: "",
        city: "Pune",
        duration: "2 hours",
        date: "2026-11-20",
        time: "10:00",
        maxSeats: 10,
        seatsRemaining: 5,
        coverImage: "",
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

const current = workshop({ id: "current", seatsRemaining: 0 });

describe("suggestedAlternatives", () => {
    it("offers upcoming workshops of the same activity or city that have seats", () => {
        const open = workshop({ id: "open" });
        const otherCity = workshop({ id: "other-city", city: "Mumbai", category: "Pottery" });
        const unrelated = workshop({ id: "unrelated", city: "Mumbai", category: "Baking" });
        expect(
            suggestedAlternatives([open, otherCity, unrelated], current, TODAY, []).map(
                (item) => item.id
            )
        ).toEqual(["open", "other-city"]);
    });

    it("skips the workshop itself, full ones and past ones", () => {
        const picks = suggestedAlternatives(
            [
                current,
                workshop({ id: "full", seatsRemaining: 0 }),
                workshop({ id: "past", date: "2026-10-23" }),
                workshop({ id: "today", date: TODAY }),
            ],
            current,
            TODAY,
            []
        );
        expect(picks.map((item) => item.id)).toEqual(["today"]);
    });

    it("never suggests a workshop whose bookings the admin closed, seats or not", () => {
        const picks = suggestedAlternatives(
            [workshop({ id: "closed", seatsRemaining: 8 }), workshop({ id: "open" })],
            current,
            TODAY,
            ["closed"]
        );
        expect(picks.map((item) => item.id)).toEqual(["open"]);
    });

    it("shows at most three", () => {
        const many = ["a", "b", "c", "d", "e"].map((id) => workshop({ id }));
        expect(suggestedAlternatives(many, current, TODAY, [])).toHaveLength(3);
    });
});
