import { describe, expect, it } from "vitest";
import type { AdminCoupon } from "@/lib/api-client";
import { couponCreateSchema, couponUpdateSchema } from "@/lib/validators";
import {
    checkOfferForm,
    EMPTY_OFFER_FORM,
    enteredEndFromValidUntil,
    formFromCoupon,
    istLocalToIso,
    isoToIstLocal,
    OFFER_PRESETS,
    offerPayloadFromForm,
    validUntilFromEnteredEnd,
    type OfferFormState,
} from "./offer-form";

const base: OfferFormState = {
    ...EMPTY_OFFER_FORM,
    code: "DIWALI10",
    discountType: "percentage",
    discountValue: "10",
};

function preset(id: string, form: OfferFormState = base) {
    const found = OFFER_PRESETS.find((item) => item.id === id);
    if (!found) throw new Error(`no preset ${id}`);
    return found.apply(form);
}

describe("IST dates", () => {
    it("reads a datetime-local value as IST", () => {
        expect(istLocalToIso("2026-10-31T23:59")).toBe("2026-10-31T23:59:00+05:30");
        expect(new Date(istLocalToIso("2026-10-31T23:59") as string).toISOString()).toBe(
            "2026-10-31T18:29:00.000Z"
        );
    });

    it("refuses malformed and impossible dates", () => {
        expect(istLocalToIso("")).toBeNull();
        expect(istLocalToIso("31/10/2026 23:59")).toBeNull();
        expect(istLocalToIso("2026-02-31T10:00")).toBeNull();
    });

    it("shows a stored instant back in IST", () => {
        expect(isoToIstLocal("2026-10-31T18:29:00.000Z")).toBe("2026-10-31T23:59");
        expect(isoToIstLocal(null)).toBe("");
        expect(isoToIstLocal("not a date")).toBe("");
    });

    it("stores an advertised end plus 30 minutes, and shows it back minus 30", () => {
        const stored = validUntilFromEnteredEnd("2026-10-31T23:30", "auto");
        expect(stored).toBe("2026-11-01T00:00:00+05:30");
        expect(enteredEndFromValidUntil(stored, "auto")).toBe("2026-10-31T23:30");
        for (const visibility of ["listed", "community"] as const) {
            const value = validUntilFromEnteredEnd("2026-10-31T23:30", visibility);
            expect(enteredEndFromValidUntil(value, visibility)).toBe("2026-10-31T23:30");
        }
    });

    it("keeps a hidden code's end exactly as entered", () => {
        const stored = validUntilFromEnteredEnd("2026-10-31T23:30", "hidden");
        expect(stored).toBe("2026-10-31T23:30:00+05:30");
        expect(enteredEndFromValidUntil(stored, "hidden")).toBe("2026-10-31T23:30");
    });
});

describe("presets", () => {
    it("Limited-time 10% is an auto offer with its end shown", () => {
        const form = preset("limited_time", { ...EMPTY_OFFER_FORM, code: "FLASH" });
        expect(form).toMatchObject({
            discountType: "percentage",
            discountValue: "10",
            visibility: "auto",
            showEndDate: true,
            maxUses: "",
        });
        // The end date is still the admin's to enter.
        expect(checkOfferForm(form, { isNew: true }).errors.endsAt).toBeTruthy();
    });

    it("Community price drop, Public coupon and Group offer", () => {
        expect(preset("community")).toMatchObject({
            visibility: "community",
            label: "Community price drop",
        });
        expect(preset("public")).toMatchObject({ visibility: "listed" });
        expect(preset("group")).toMatchObject({ visibility: "auto", minGuests: "2" });
    });
});

describe("checkOfferForm", () => {
    it("accepts a plain hidden code", () => {
        expect(checkOfferForm(base, { isNew: true })).toEqual({ errors: {}, warnings: [] });
    });

    it("refuses a label that spells out a non-listed code, but not a listed one", () => {
        const form = { ...base, visibility: "community" as const, label: "Use DIWALI10 now" };
        expect(checkOfferForm(form, { isNew: true }).errors.label).toMatch(/code/);
        expect(
            checkOfferForm({ ...form, visibility: "listed" }, { isNew: true }).errors.label
        ).toBeUndefined();
    });

    it("warns when the label states another discount", () => {
        const { errors, warnings } = checkOfferForm(
            { ...base, visibility: "auto", label: "Flat 20% off", endsAt: "2026-12-01T10:00" },
            { isNew: true }
        );
        expect(errors).toEqual({});
        expect(warnings.join(" ")).toMatch(/different discount/);
    });

    it("warns about max uses on auto and community offers", () => {
        const { warnings } = checkOfferForm(
            { ...base, visibility: "community", maxUses: "50" },
            { isNew: true }
        );
        expect(warnings.join(" ")).toMatch(/max uses/i);
    });

    it("checks amounts, seats, dates and workshops", () => {
        const { errors } = checkOfferForm(
            {
                ...base,
                code: "x",
                discountValue: "150",
                minGuests: "1",
                maxUses: "0",
                startsAt: "2026-11-02T10:00",
                endsAt: "2026-11-01T10:00",
                workshopIds: [],
            },
            { isNew: true }
        );
        expect(Object.keys(errors).sort()).toEqual(
            ["code", "discountValue", "endsAt", "maxUses", "minGuests", "workshopIds"].sort()
        );
        expect(
            checkOfferForm({ ...base, minGuests: "21" }, { isNew: true }).errors.minGuests
        ).toBeTruthy();
        expect(
            checkOfferForm({ ...base, showEndDate: true }, { isNew: true }).errors.endsAt
        ).toBeTruthy();
    });
});

describe("offerPayloadFromForm", () => {
    it("builds a create body the server schema accepts", () => {
        const form = {
            ...preset("limited_time"),
            endsAt: "2026-11-15T23:30",
            workshopIds: ["pottery-1760000000000"],
        };
        const payload = offerPayloadFromForm(form, { isNew: true });
        expect(payload).toMatchObject({
            code: "DIWALI10",
            discount_type: "percentage",
            discount_value: 10,
            visibility: "auto",
            label: "Limited-time offer",
            min_guests: null,
            show_end_date: true,
            valid_until: "2026-11-16T00:00:00+05:30",
            applicable_workshop_ids: ["pottery-1760000000000"],
        });
        expect(payload).not.toHaveProperty("max_uses");
        expect(payload).not.toHaveProperty("valid_from");
        const parsed = couponCreateSchema.safeParse(payload);
        expect(parsed.success).toBe(true);
        expect(parsed.data?.valid_until).toBe("2026-11-15T18:30:00.000Z");
    });

    it("clears optional rules on an update and never sends the code", () => {
        const payload = offerPayloadFromForm(
            { ...base, visibility: "listed", minGuests: "3" },
            { isNew: false }
        );
        expect(payload).not.toHaveProperty("code");
        expect(payload).toMatchObject({
            max_uses: null,
            min_order_amount: 0,
            valid_until: null,
            min_guests: 3,
            visibility: "listed",
        });
        expect(couponUpdateSchema.safeParse(payload).success).toBe(true);
    });

    it("round-trips a stored coupon through the editor unchanged", () => {
        const coupon: AdminCoupon = {
            id: "6f1c1b7e-5d43-4a4f-9b0d-1d2f3a4b5c6d",
            code: "GROUP",
            discount_type: "fixed",
            discount_value: 200,
            is_active: true,
            used_count: 4,
            valid_until: "2026-11-16T00:00:00+05:30",
            valid_from: "2026-10-20T04:30:00.000Z",
            created_at: null,
            applicable_workshop_ids: null,
            min_order_amount: 0,
            max_uses: null,
            visibility: "auto",
            label: "Group offer",
            min_guests: 2,
            show_end_date: true,
        };
        const form = formFromCoupon(coupon);
        expect(form).toMatchObject({
            endsAt: "2026-11-15T23:30",
            startsAt: "2026-10-20T10:00",
            minGuests: "2",
            minOrderAmount: "",
            workshopIds: null,
        });
        const payload = offerPayloadFromForm(form, { isNew: false });
        expect(new Date(payload.valid_until as string).getTime()).toBe(
            new Date(coupon.valid_until as string).getTime()
        );
        expect(new Date(payload.valid_from as string).getTime()).toBe(
            new Date(coupon.valid_from as string).getTime()
        );
    });
});
