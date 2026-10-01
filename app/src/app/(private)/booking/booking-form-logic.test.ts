import { describe, expect, it } from "vitest";
import {
    formatPhoneHint,
    normalizePhoneInput,
    validateBookingDetails,
    validateBookingField,
} from "./booking-form-logic";

describe("normalizePhoneInput", () => {
    it("keeps only digits and caps at 10", () => {
        expect(normalizePhoneInput("98765 43210")).toBe("9876543210");
        expect(normalizePhoneInput("98a76-5")).toBe("98765");
        expect(normalizePhoneInput("98765432109999")).toBe("9876543210");
    });

    it("drops a pasted country or trunk prefix", () => {
        expect(normalizePhoneInput("+91 98765 43210")).toBe("9876543210");
        expect(normalizePhoneInput("09876543210")).toBe("9876543210");
    });
});

describe("formatPhoneHint", () => {
    it("groups digits as 5 + 5", () => {
        expect(formatPhoneHint("9876543210")).toBe("98765 43210");
        expect(formatPhoneHint("98765")).toBe("98765");
        expect(formatPhoneHint("")).toBe("");
    });
});

describe("validation", () => {
    const valid = {
        firstName: "Asha",
        lastName: "Rao",
        email: "asha@example.com",
        phone: "9876543210",
    };

    it("accepts a complete form", () => {
        expect(validateBookingDetails(valid)).toEqual({});
    });

    it("reports each missing field with the established messages", () => {
        expect(
            validateBookingDetails({ firstName: " ", lastName: "", email: "", phone: "" })
        ).toEqual({
            firstName: "First name is required.",
            lastName: "Last name is required.",
            email: "Email is required.",
            phone: "Phone number is required.",
        });
    });

    it("rejects malformed email and phone", () => {
        expect(validateBookingField("email", "nope@")).toBe("Enter a valid email address.");
        expect(validateBookingField("phone", "12345")).toBe("Enter a valid 10-digit phone number.");
        expect(validateBookingField("phone", "98765 43210")).toBeUndefined();
    });
});
