import type { FormErrors } from "./types";

export type BookingDetailFields = {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PHONE_DIGITS = 10;

/**
 * Keeps only digits for the phone field, drops a pasted "+91"/"91"/"0" prefix, and caps the
 * length. The stored value is what is sent to checkout, so it is always plain digits.
 */
export function normalizePhoneInput(raw: string) {
    let digits = raw.replace(/\D/g, "");
    if (digits.length > PHONE_DIGITS) {
        if (digits.length === PHONE_DIGITS + 2 && digits.startsWith("91")) {
            digits = digits.slice(2);
        } else if (digits.length === PHONE_DIGITS + 1 && digits.startsWith("0")) {
            digits = digits.slice(1);
        }
    }
    return digits.slice(0, PHONE_DIGITS);
}

/** "98765 43210" for display next to the input. */
export function formatPhoneHint(digits: string) {
    const clean = digits.replace(/\D/g, "").slice(0, PHONE_DIGITS);
    return clean.length > 5 ? `${clean.slice(0, 5)} ${clean.slice(5)}` : clean;
}

export function validateBookingField(
    field: keyof BookingDetailFields,
    value: string
): string | undefined {
    const trimmed = value.trim();

    switch (field) {
        case "firstName":
            return trimmed ? undefined : "First name is required.";
        case "lastName":
            return trimmed ? undefined : "Last name is required.";
        case "email":
            if (!trimmed) return "Email is required.";
            return EMAIL_PATTERN.test(trimmed) ? undefined : "Enter a valid email address.";
        case "phone": {
            if (!trimmed) return "Phone number is required.";
            const digits = trimmed.replace(/\D/g, "");
            return new RegExp(`^\\d{${PHONE_DIGITS}}$`).test(digits)
                ? undefined
                : "Enter a valid 10-digit phone number.";
        }
        default:
            return undefined;
    }
}

/** Same rules and messages the checkout step has always used, shared with the inline form. */
export function validateBookingDetails(fields: BookingDetailFields): FormErrors {
    const errors: FormErrors = {};
    (Object.keys(fields) as Array<keyof BookingDetailFields>).forEach((field) => {
        const message = validateBookingField(field, fields[field]);
        if (message) errors[field] = message;
    });
    return errors;
}
