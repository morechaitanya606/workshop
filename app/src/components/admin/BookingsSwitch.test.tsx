import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    ApiClientError,
    getAdminWorkshopBookingStatus,
    setAdminWorkshopBookingsClosed,
} from "@/lib/api-client";
import BookingsSwitch, {
    closeBookingsConfirmText,
    withConfirmedBookingsState,
} from "./BookingsSwitch";

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        getAdminWorkshopBookingStatus: vi.fn(),
        setAdminWorkshopBookingsClosed: vi.fn(),
    };
});

const setClosed = vi.mocked(setAdminWorkshopBookingsClosed);
const getStatus = vi.mocked(getAdminWorkshopBookingStatus);

function renderSwitch(closed = false, onChange = vi.fn()) {
    render(
        <BookingsSwitch
            workshopId="pottery-1760000000000"
            title="Pottery Basics"
            closed={closed}
            bookedSeats={7}
            maxSeats={12}
            accessToken="token"
            onChange={onChange}
        />
    );
    return onChange;
}

/** Presses the switch, then answers the question that appears on the page. */
function closeBookings(title = "Pottery Basics") {
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: `Close bookings for ${title}` }));
}

describe("BookingsSwitch", () => {
    beforeEach(() => {
        // Embedded and in-app browsers answer window.confirm with "cancel" at once and show
        // nothing. The switch must work even then, so it never uses the native dialog.
        vi.spyOn(window, "confirm").mockReturnValue(false);
    });
    afterEach(() => {
        cleanup();
    });

    it("shows the state and the booked seats", () => {
        renderSwitch(false);
        expect(screen.getByRole("switch")).toHaveTextContent("Bookings: Open");
        expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
        expect(screen.getByText("7/12 seats booked")).toBeInTheDocument();
    });

    it("is named after its workshop, starting with the visible text, and is a 44px target", () => {
        const { rerender } = render(
            <BookingsSwitch
                workshopId="pottery-1760000000000"
                title="Pottery Basics"
                closed={false}
                bookedSeats={7}
                maxSeats={12}
                accessToken="token"
                onChange={vi.fn()}
            />
        );
        const toggle = screen.getByRole("switch");
        expect(toggle).toHaveAccessibleName("Bookings: Open for Pottery Basics");
        expect(toggle.className).toContain("min-h-[44px]");

        rerender(
            <BookingsSwitch
                workshopId="pottery-1760000000000"
                title="Pottery Basics"
                closed
                bookedSeats={7}
                maxSeats={12}
                accessToken="token"
                onChange={vi.fn()}
            />
        );
        expect(screen.getByRole("switch")).toHaveAccessibleName(
            "Bookings: Closed for Pottery Basics"
        );
        expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    });

    it("asks on the page before closing and saves through the dedicated route", async () => {
        let resolve: (value: Awaited<ReturnType<typeof setClosed>>) => void = () => {};
        setClosed.mockReturnValue(new Promise((r) => (resolve = r)));
        const onChange = renderSwitch(false);

        fireEvent.click(screen.getByRole("switch"));
        expect(closeBookingsConfirmText("Pottery Basics")).toBe(
            "Close bookings for Pottery Basics? It stays visible with 'Bookings closed' and no Book button, and nobody can start a new booking. Existing bookings and payments already started are not affected."
        );
        // The question is on the page, nothing is saved yet, and focus is on the answer.
        const question = screen.getByRole("group", {
            name: "Confirm closing bookings for Pottery Basics",
        });
        expect(question).toHaveTextContent(closeBookingsConfirmText("Pottery Basics"));
        expect(setClosed).not.toHaveBeenCalled();
        expect(screen.getByRole("switch")).toHaveTextContent("Bookings: Open");
        expect(
            screen.getByRole("button", { name: "Close bookings for Pottery Basics" })
        ).toHaveFocus();

        fireEvent.click(screen.getByRole("button", { name: "Close bookings for Pottery Basics" }));
        expect(window.confirm).not.toHaveBeenCalled();
        expect(screen.queryByRole("group")).not.toBeInTheDocument();
        // Optimistic, and disabled while saving.
        expect(screen.getByRole("switch")).toHaveTextContent("Bookings: Closed");
        expect(screen.getByRole("switch")).toBeDisabled();
        expect(setClosed).toHaveBeenCalledWith("token", "pottery-1760000000000", true);

        resolve({
            workshopId: "pottery-1760000000000",
            closed: true,
            closedWorkshopIds: ["pottery-1760000000000"],
        });
        await waitFor(() => expect(onChange).toHaveBeenCalledWith(true, ["pottery-1760000000000"]));
    });

    it("does nothing when the owner keeps bookings open", () => {
        renderSwitch(false);
        fireEvent.click(screen.getByRole("switch"));
        fireEvent.click(screen.getByRole("button", { name: "Keep open" }));
        expect(screen.queryByRole("group")).not.toBeInTheDocument();
        expect(setClosed).not.toHaveBeenCalled();
        expect(screen.getByRole("switch")).toHaveTextContent("Bookings: Open");
    });

    it("closes the question with Escape or by pressing the switch again", () => {
        renderSwitch(false);
        fireEvent.click(screen.getByRole("switch"));
        fireEvent.keyDown(screen.getByRole("group"), { key: "Escape" });
        expect(screen.queryByRole("group")).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("switch"));
        expect(screen.getByRole("group")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("switch"));
        expect(screen.queryByRole("group")).not.toBeInTheDocument();
        expect(setClosed).not.toHaveBeenCalled();
    });

    it("never asks when the state is unknown or there is no session", () => {
        render(
            <BookingsSwitch
                workshopId="pottery-1760000000000"
                title="Pottery Basics"
                closed={false}
                accessToken={null}
                bookedSeats={null}
                onChange={vi.fn()}
            />
        );
        fireEvent.click(screen.getByRole("switch"));
        expect(screen.queryByRole("group")).not.toBeInTheDocument();
        expect(setClosed).not.toHaveBeenCalled();
    });

    it("reopens without asking", async () => {
        setClosed.mockResolvedValue({
            workshopId: "pottery-1760000000000",
            closed: false,
            closedWorkshopIds: [],
        });
        const onChange = renderSwitch(true);
        fireEvent.click(screen.getByRole("switch"));
        expect(window.confirm).not.toHaveBeenCalled();
        await waitFor(() => expect(onChange).toHaveBeenCalledWith(false, []));
    });

    it("rolls back and explains when the save is refused", async () => {
        setClosed.mockRejectedValue(
            new ApiClientError("Could not read the closed workshops, so nothing was changed.", 503)
        );
        const onChange = renderSwitch(false);
        closeBookings();
        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Unable to change bookings right now. Nothing was changed."
        );
        expect(screen.getByRole("switch")).toHaveTextContent("Bookings: Open");
        expect(screen.getByRole("switch")).not.toBeDisabled();
        expect(onChange).not.toHaveBeenCalled();
    });

    it("shows the server's reason when another save was in the way, and rolls back", async () => {
        setClosed.mockRejectedValue(
            new ApiClientError(
                "Another change was saving at the same moment, so nothing was changed. Try again.",
                409
            )
        );
        const onChange = renderSwitch(false);
        closeBookings();
        expect(await screen.findByRole("alert")).toHaveTextContent(/Another change was saving/);
        expect(screen.getByRole("switch")).toHaveTextContent("Bookings: Open");
        expect(onChange).not.toHaveBeenCalled();
    });

    it("re-reads the real state when the connection drops mid-save", async () => {
        setClosed.mockRejectedValue(new ApiClientError("offline", 0));
        getStatus.mockResolvedValue({
            workshopId: "pottery-1760000000000",
            closed: true,
            closedWorkshopIds: ["pottery-1760000000000"],
        });
        const onChange = renderSwitch(false);
        closeBookings();
        await waitFor(() => expect(onChange).toHaveBeenCalledWith(true, ["pottery-1760000000000"]));
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("treats a gateway timeout like a dropped connection: re-reads instead of claiming nothing changed", async () => {
        // The function may have finished writing before the gateway gave up.
        setClosed.mockRejectedValue(new ApiClientError("Request failed.", 504));
        getStatus.mockResolvedValue({
            workshopId: "pottery-1760000000000",
            closed: true,
            closedWorkshopIds: ["pottery-1760000000000"],
        });
        const onChange = renderSwitch(false);
        closeBookings();
        await waitFor(() => expect(onChange).toHaveBeenCalledWith(true, ["pottery-1760000000000"]));
        expect(getStatus).toHaveBeenCalledWith("token", "pottery-1760000000000");
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("says the change was not saved when the re-read after a timeout shows the old state", async () => {
        setClosed.mockRejectedValue(new ApiClientError("Request failed.", 502));
        getStatus.mockResolvedValue({
            workshopId: "pottery-1760000000000",
            closed: false,
            closedWorkshopIds: [],
        });
        const onChange = renderSwitch(false);
        closeBookings();
        expect(await screen.findByRole("alert")).toHaveTextContent(/was not saved/);
        expect(onChange).toHaveBeenCalledWith(false, []);
        expect(screen.getByRole("switch")).toHaveTextContent("Bookings: Open");
        expect(screen.getByRole("switch")).not.toBeDisabled();
    });

    it("says so when even the re-read fails", async () => {
        setClosed.mockRejectedValue(new ApiClientError("offline", 0));
        getStatus.mockRejectedValue(new ApiClientError("offline", 0));
        renderSwitch(false);
        closeBookings();
        expect(await screen.findByRole("alert")).toHaveTextContent(/Refresh the page/);
        expect(screen.getByRole("switch")).toHaveTextContent("Bookings: Open");
    });

    it("withConfirmedBookingsState changes only the workshop that was confirmed", () => {
        const start = new Set(["a", "b"]);

        expect([...withConfirmedBookingsState(start, "c", true)].sort()).toEqual(["a", "b", "c"]);
        expect([...withConfirmedBookingsState(start, "a", false)]).toEqual(["b"]);
        expect([...withConfirmedBookingsState(start, "a", true)].sort()).toEqual(["a", "b"]);
        // Never mutates what it was given.
        expect([...start].sort()).toEqual(["a", "b"]);
    });

    it("is disabled when the state is unknown", () => {
        render(
            <BookingsSwitch
                workshopId="pottery-1760000000000"
                title="Pottery Basics"
                closed={false}
                known={false}
                bookedSeats={null}
                accessToken="token"
                onChange={vi.fn()}
            />
        );
        expect(screen.getByRole("switch")).toBeDisabled();
        expect(screen.getByText(/could not be loaded/)).toBeInTheDocument();
    });
});
