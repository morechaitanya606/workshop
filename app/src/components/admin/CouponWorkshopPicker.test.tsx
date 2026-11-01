import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CouponWorkshopPicker, { type CouponWorkshopOption } from "./CouponWorkshopPicker";

const TODAY = "2026-10-24";
// 24 Oct 2026, 13:30 IST.
const NOW = new Date("2026-10-24T08:00:00.000Z");

const workshops: CouponWorkshopOption[] = [
    { id: "past-1", title: "Terrarium Making", date: "2026-10-18", time: "12:00" },
    { id: "later", title: "Grazing Table", date: "2026-11-01", time: "11:00" },
    { id: "morning", title: "Ice Plunge", date: "2026-10-24", time: "09:00" },
    { id: "evening", title: "Evening Class", date: "2026-10-24", time: "18:00" },
    { id: "soon", title: "Chocolate Making", date: "2026-10-25", time: "15:00" },
    { id: "past-2", title: "Pottery Basics", date: "2026-09-12", time: "10:00" },
];

function renderPicker(value: string[] | null, onChange = vi.fn()) {
    render(
        <CouponWorkshopPicker
            workshops={workshops}
            value={value}
            onChange={onChange}
            todayIso={TODAY}
        />
    );
    return onChange;
}

function listedTitles() {
    return screen.getAllByRole("checkbox").map((box) => box.closest("label")?.textContent ?? "");
}

describe("CouponWorkshopPicker", () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(NOW);
    });
    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it("lists only workshops that have not started, soonest first", () => {
        renderPicker([]);

        const titles = listedTitles();
        expect(titles).toHaveLength(3);
        expect(titles[0]).toContain("Evening Class");
        expect(titles[1]).toContain("Chocolate Making");
        expect(titles[2]).toContain("Grazing Table");
        // Past dates, and today's workshop whose start time has passed (the cards say "ended").
        expect(screen.queryByText(/Terrarium Making/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Pottery Basics/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Ice Plunge/)).not.toBeInTheDocument();
        expect(screen.queryByText(/past/)).not.toBeInTheDocument();
    });

    it("keeps a past workshop that the offer already names, marked past, so it can be unticked", () => {
        const onChange = renderPicker(["past-1", "morning", "later"]);

        const titles = listedTitles();
        expect(titles).toHaveLength(5);
        const past = titles.slice(3).join(" ");
        expect(past).toContain("Ice Plunge");
        expect(past).toContain("Terrarium Making");
        expect(past).toContain("past");
        // Other past workshops stay out.
        expect(screen.queryByText(/Pottery Basics/)).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("checkbox", { name: /Terrarium Making/ }));
        expect(onChange).toHaveBeenCalledWith(["morning", "later"]);
    });

    it("ticks an upcoming workshop", () => {
        const onChange = renderPicker([]);
        fireEvent.click(screen.getByRole("checkbox", { name: /Chocolate Making/ }));
        expect(onChange).toHaveBeenCalledWith(["soon"]);
    });

    it("falls back to the date when a workshop has no time", () => {
        render(
            <CouponWorkshopPicker
                workshops={[
                    { id: "a", title: "Today No Time", date: "2026-10-24" },
                    { id: "b", title: "Yesterday No Time", date: "2026-10-23" },
                ]}
                value={[]}
                onChange={vi.fn()}
                todayIso={TODAY}
            />
        );
        expect(screen.getByRole("checkbox", { name: /Today No Time/ })).toBeInTheDocument();
        expect(screen.queryByText(/Yesterday No Time/)).not.toBeInTheDocument();
    });

    it("lists a workshop without a date rather than making it unreachable", () => {
        render(
            <CouponWorkshopPicker
                workshops={[{ id: "no-date", title: "Dateless", date: "" }]}
                value={[]}
                onChange={vi.fn()}
                todayIso={TODAY}
            />
        );
        expect(screen.getByRole("checkbox", { name: /Dateless/ })).toBeInTheDocument();
    });

    it("says there is nothing to choose when no workshop is upcoming, and when a search finds none", () => {
        const { rerender } = render(
            <CouponWorkshopPicker
                workshops={[workshops[0]]}
                value={[]}
                onChange={vi.fn()}
                todayIso={TODAY}
            />
        );
        expect(screen.getByText("No upcoming workshops to choose from.")).toBeInTheDocument();

        rerender(
            <CouponWorkshopPicker
                workshops={workshops}
                value={[]}
                onChange={vi.fn()}
                todayIso={TODAY}
            />
        );
        fireEvent.change(screen.getByLabelText("Search workshops"), {
            target: { value: "zzz" },
        });
        expect(screen.getByText("No workshops match.")).toBeInTheDocument();
    });

    it("shows no list while the offer applies to all workshops", () => {
        renderPicker(null);
        expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    });
});
