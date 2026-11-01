import { describe, expect, it } from "vitest";
import { PAST_EVENTS_CATEGORY_LABEL } from "@/lib/data";
import { exploreResultsHeading } from "./explore-results-heading";

describe("exploreResultsHeading", () => {
    it("says upcoming for every category but Past Events", () => {
        expect(exploreResultsHeading({ category: "" })).toBe("Upcoming workshops");
        expect(exploreResultsHeading({ category: "Culinary Arts" })).toBe("Upcoming workshops");
    });

    it("says past for the Past Events category, which lists finished sessions", () => {
        expect(exploreResultsHeading({ category: PAST_EVENTS_CATEGORY_LABEL })).toBe(
            "Past workshops"
        );
        expect(exploreResultsHeading({ category: " past events " })).toBe("Past workshops");
    });

    it("never names a city, so it does not repeat the h1 or echo the query string", () => {
        // ExploreClient passes its whole parsed query, city filter included.
        const freeText = { city: "Cheap tickets here", category: "" };
        const pune = { city: "Pune", category: PAST_EVENTS_CATEGORY_LABEL };
        expect(exploreResultsHeading(freeText)).toBe("Upcoming workshops");
        expect(exploreResultsHeading(pune)).toBe("Past workshops");
    });
});
