import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    createAdminCoupon,
    deleteAdminCoupon,
    getAdminCoupons,
    getAdminWorkshops,
    updateAdminCoupon,
    type AdminCoupon,
} from "@/lib/api-client";
import { offerAppliesToWorkshop } from "./offer-form";
import OffersManager from "./OffersManager";

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        getAdminCoupons: vi.fn(),
        getAdminWorkshops: vi.fn(),
        createAdminCoupon: vi.fn(),
        updateAdminCoupon: vi.fn(),
        deleteAdminCoupon: vi.fn(),
    };
});

const listCoupons = vi.mocked(getAdminCoupons);
const listWorkshops = vi.mocked(getAdminWorkshops);
const create = vi.mocked(createAdminCoupon);
const update = vi.mocked(updateAdminCoupon);
const remove = vi.mocked(deleteAdminCoupon);

const WORKSHOP = { id: "pottery-1760000000000", title: "Pottery Basics" };
const OTHER_ID = "baking-1760000000001";

function coupon(overrides: Partial<AdminCoupon> = {}): AdminCoupon {
    return {
        id: "coupon-1",
        code: "ALLCODE",
        discount_type: "percentage",
        discount_value: 10,
        is_active: true,
        used_count: 0,
        valid_until: null,
        created_at: null,
        applicable_workshop_ids: null,
        visibility: "hidden",
        label: null,
        ...overrides,
    };
}

const ALL = coupon({ id: "c-all", code: "ALLCODE" });
const MINE = coupon({ id: "c-mine", code: "MINEONLY", applicable_workshop_ids: [WORKSHOP.id] });
const OTHER = coupon({ id: "c-other", code: "OTHERONLY", applicable_workshop_ids: [OTHER_ID] });

function renderManager(props: { workshop?: typeof WORKSHOP | null; onChange?: () => void } = {}) {
    return render(<OffersManager accessToken="token" {...props} />);
}

describe("offerAppliesToWorkshop", () => {
    it("is true for an offer on every workshop or one that lists this workshop", () => {
        expect(offerAppliesToWorkshop({ applicable_workshop_ids: null }, "a")).toBe(true);
        expect(offerAppliesToWorkshop({ applicable_workshop_ids: [] }, "a")).toBe(true);
        expect(offerAppliesToWorkshop({}, "a")).toBe(true);
        expect(offerAppliesToWorkshop({ applicable_workshop_ids: ["b", "a"] }, "a")).toBe(true);
        expect(offerAppliesToWorkshop({ applicable_workshop_ids: ["b"] }, "a")).toBe(false);
    });
});

describe("OffersManager", () => {
    beforeEach(() => {
        listCoupons.mockResolvedValue({
            coupons: [ALL, MINE, OTHER],
            nextCursor: null,
            offerSettingsOk: true,
        } as never);
        listWorkshops.mockResolvedValue({
            data: [
                { id: WORKSHOP.id, title: WORKSHOP.title, date: "2026-11-20" },
                { id: OTHER_ID, title: "Sourdough Baking", date: "2026-11-22" },
            ],
        } as never);
        // The native dialog is blocked in embedded browsers: nothing here may depend on it.
        vi.spyOn(window, "confirm").mockReturnValue(false);
    });
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it("on a workshop's page lists the offers for all workshops and for this one only", async () => {
        renderManager({ workshop: WORKSHOP });

        expect(await screen.findByText("ALLCODE")).toBeInTheDocument();
        expect(screen.getByText("MINEONLY")).toBeInTheDocument();
        expect(screen.queryByText("OTHERONLY")).not.toBeInTheDocument();
        expect(screen.getByText("This workshop only")).toBeInTheDocument();
        expect(screen.getByText("All workshops")).toBeInTheDocument();
    });

    it("tells the owner that offers do not add up", async () => {
        renderManager({ workshop: WORKSHOP });

        const note = await screen.findByTestId("offers-combine-note");
        expect(note).toHaveTextContent("Early Bird");
        expect(note).toHaveTextContent("ONE offer");
        expect(note).toHaveTextContent("Offers do not add up");
    });

    it("in Admin > Offers lists every offer", async () => {
        renderManager();

        expect(await screen.findByText("ALLCODE")).toBeInTheDocument();
        expect(screen.getByText("MINEONLY")).toBeInTheDocument();
        expect(screen.getByText("OTHERONLY")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "New offer" })).toBeInTheDocument();
    });

    it("says so when no offer reaches the workshop", async () => {
        listCoupons.mockResolvedValue({ coupons: [OTHER], nextCursor: null } as never);
        renderManager({ workshop: WORKSHOP });

        expect(await screen.findByText("No offers for this workshop yet.")).toBeInTheDocument();
    });

    it("starts a new offer limited to this workshop", async () => {
        create.mockResolvedValue({
            coupon: coupon({
                id: "c-new",
                code: "NEW15",
                discount_value: 15,
                visibility: "listed",
                applicable_workshop_ids: [WORKSHOP.id],
            }),
        } as never);
        const onChange = vi.fn();
        renderManager({ workshop: WORKSHOP, onChange });

        fireEvent.click(await screen.findByRole("button", { name: "Add offer for this workshop" }));
        expect(screen.getByText("New offer for Pottery Basics")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Public coupon/ }));
        fireEvent.change(screen.getByLabelText("Code"), { target: { value: "new15" } });
        fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "15" } });
        fireEvent.click(screen.getByRole("button", { name: "Add offer" }));

        await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
        expect(create.mock.calls[0][0]).toBe("token");
        expect(create.mock.calls[0][1]).toMatchObject({
            code: "NEW15",
            discount_type: "percentage",
            discount_value: 15,
            visibility: "listed",
            applicable_workshop_ids: [WORKSHOP.id],
        });
        expect(await screen.findByText("Offer NEW15 added.")).toBeInTheDocument();
        expect(screen.getByText("NEW15")).toBeInTheDocument();
        expect(onChange).toHaveBeenCalled();
    });

    it("explains when an offer added here was limited to other workshops", async () => {
        create.mockResolvedValue({
            coupon: coupon({
                id: "c-new",
                code: "ELSEWHERE",
                applicable_workshop_ids: [OTHER_ID],
            }),
        } as never);
        renderManager({ workshop: WORKSHOP });

        fireEvent.click(await screen.findByRole("button", { name: "Add offer for this workshop" }));
        fireEvent.change(screen.getByLabelText("Code"), { target: { value: "elsewhere" } });
        fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "10" } });
        fireEvent.click(screen.getByRole("button", { name: "Add offer" }));

        expect(
            await screen.findByText(/It applies to other workshops, so it is not listed here/)
        ).toBeInTheDocument();
        expect(screen.queryByText("ELSEWHERE")).not.toBeInTheDocument();
    });

    it("switches an offer off and on", async () => {
        update.mockResolvedValue({ coupon: { ...ALL, is_active: false } } as never);
        const onChange = vi.fn();
        renderManager({ workshop: WORKSHOP, onChange });

        const row = (await screen.findByText("ALLCODE")).closest("li") as HTMLElement;
        fireEvent.click(within(row).getByRole("button", { name: "Active" }));

        await waitFor(() =>
            expect(update).toHaveBeenCalledWith("token", "c-all", { is_active: false })
        );
        expect(await within(row).findByRole("button", { name: "Off" })).toBeInTheDocument();
        expect(onChange).toHaveBeenCalled();
    });

    it("asks on the page before deleting, never with the native dialog", async () => {
        remove.mockResolvedValue({} as never);
        const onChange = vi.fn();
        renderManager({ workshop: WORKSHOP, onChange });

        const row = (await screen.findByText("MINEONLY")).closest("li") as HTMLElement;
        fireEvent.click(within(row).getByRole("button", { name: "Delete offer MINEONLY" }));

        expect(
            within(row).getByRole("group", { name: "Confirm deleting offer MINEONLY" })
        ).toBeInTheDocument();
        expect(remove).not.toHaveBeenCalled();

        fireEvent.click(
            within(row).getByRole("button", { name: "Delete offer MINEONLY permanently" })
        );
        await waitFor(() => expect(remove).toHaveBeenCalledWith("token", "c-mine"));
        await waitFor(() => expect(screen.queryByText("MINEONLY")).not.toBeInTheDocument());
        expect(window.confirm).not.toHaveBeenCalled();
        expect(onChange).toHaveBeenCalled();
    });

    it("keeps the offer when the owner changes their mind", async () => {
        renderManager({ workshop: WORKSHOP });

        const row = (await screen.findByText("ALLCODE")).closest("li") as HTMLElement;
        fireEvent.click(within(row).getByRole("button", { name: "Delete offer ALLCODE" }));
        fireEvent.click(within(row).getByRole("button", { name: "Keep offer" }));

        expect(within(row).queryByRole("group")).not.toBeInTheDocument();
        expect(remove).not.toHaveBeenCalled();
        expect(screen.getByText("ALLCODE")).toBeInTheDocument();
    });

    it("offers a retry when the offers cannot be loaded", async () => {
        listCoupons.mockRejectedValueOnce(new Error("offline"));
        renderManager({ workshop: WORKSHOP });

        fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
        expect(await screen.findByText("ALLCODE")).toBeInTheDocument();
    });
});
