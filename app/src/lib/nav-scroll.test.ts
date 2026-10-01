import { describe, expect, it } from "vitest";
import { nextNavScrollState, type NavScrollState } from "@/lib/nav-scroll";

function run(positions: number[]) {
    let state: NavScrollState = { hidden: false, lastY: 0 };
    return positions.map((y) => {
        state = nextNavScrollState(state, y);
        return state.hidden ? "hidden" : "visible";
    });
}

describe("nextNavScrollState", () => {
    it("hides while scrolling down and shows as soon as the visitor scrolls up", () => {
        expect(run([0, 1200, 1800, 1500, 2200, 600])).toEqual([
            "visible",
            "hidden",
            "hidden",
            "visible",
            "hidden",
            "visible",
        ]);
    });

    it("ignores jitter smaller than the threshold in either direction", () => {
        expect(run([1200, 1203, 1199, 1500, 1495])).toEqual([
            "hidden",
            "hidden",
            "hidden",
            "hidden",
            "hidden",
        ]);
        // Jitter after a reveal does not hide the bar again either.
        expect(run([1200, 900, 903])).toEqual(["hidden", "visible", "visible"]);
    });

    it("measures direction from the last real move, not from each jitter", () => {
        // 1500 -> 1503 is jitter; 1503 -> 2200 is still a downward move from 1500.
        expect(run([1800, 1500, 1503, 2200])).toEqual(["hidden", "visible", "visible", "hidden"]);
    });

    it("always shows near the top, including on overscroll bounce", () => {
        expect(run([1200, 40])).toEqual(["hidden", "visible"]);
        expect(run([1200, -30])).toEqual(["hidden", "visible"]);
    });
});
