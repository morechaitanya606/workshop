"use client";

import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import {
    normalizePhoneInput,
    PHONE_DIGITS,
    validateBookingField,
    type BookingDetailFields,
} from "./booking-form-logic";
import type { BookingFormData, FormErrors } from "./types";

/** The mobile bottom bar submits this form from outside it via the `form` attribute. */
export const BOOKING_DETAILS_FORM_ID = "booking-details-form";

function boxClassName(hasError: boolean) {
    return `flex w-full items-stretch overflow-hidden rounded-xl border bg-cream-50 text-sm font-inter text-dark transition-colors focus-within:ring-2 ${
        hasError
            ? "border-red-400 focus-within:border-red-500 focus-within:ring-red-200"
            : "border-clay focus-within:border-terracotta focus-within:ring-terracotta/20"
    }`;
}

const inputClassName =
    "w-full min-w-0 bg-transparent px-4 py-3 text-base font-inter text-dark outline-none placeholder:text-dark-muted/60 sm:text-sm";

function Field({
    id,
    label,
    required,
    error,
    hint,
    children,
}: {
    id: string;
    label: string;
    required?: boolean;
    error?: string;
    hint?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div>
            <label
                htmlFor={id}
                className="mb-1.5 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted"
            >
                {label}
                {required ? (
                    <span className="text-red-600" aria-hidden="true">
                        {" "}
                        *
                    </span>
                ) : (
                    <span className="ml-1 font-medium normal-case tracking-normal">(optional)</span>
                )}
            </label>
            {children}
            {error ? (
                <p
                    id={`${id}-error`}
                    role="alert"
                    className="mt-1.5 text-xs font-inter font-medium text-red-600"
                >
                    {error}
                </p>
            ) : hint ? (
                <p id={`${id}-hint`} className="mt-1.5 text-xs font-inter text-dark-muted">
                    {hint}
                </p>
            ) : null}
        </div>
    );
}

export default function BookingGuestForm({
    formData,
    formErrors,
    onFieldChange,
    onContinue,
    isBusy,
    continueDisabled = false,
    continueLabel = "Continue to review",
}: {
    formData: BookingFormData;
    formErrors: FormErrors;
    onFieldChange: (field: keyof BookingFormData, value: string) => void;
    /** Validates the details; returns true when the customer may move on. */
    onContinue: () => boolean;
    /** Shows a spinner on the button (e.g. seats are being updated). */
    isBusy: boolean;
    continueDisabled?: boolean;
    continueLabel?: string;
}) {
    const baseId = useId();
    const formRef = useRef<HTMLFormElement>(null);
    const [touched, setTouched] = useState<Partial<Record<keyof BookingDetailFields, boolean>>>({});

    const ids = {
        firstName: `${baseId}-first-name`,
        lastName: `${baseId}-last-name`,
        email: `${baseId}-email`,
        phone: `${baseId}-phone`,
        notes: `${baseId}-notes`,
    };

    const errorFor = (field: keyof BookingDetailFields) =>
        formErrors[field] ??
        (touched[field] ? validateBookingField(field, formData[field]) : undefined);

    const markTouched = (field: keyof BookingDetailFields) =>
        setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));

    const describedBy = (id: string, error: string | undefined, hasHint: boolean) =>
        error ? `${id}-error` : hasHint ? `${id}-hint` : undefined;

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        const valid = onContinue();
        if (!valid) {
            setTouched({ firstName: true, lastName: true, email: true, phone: true });
            // Wait for the errors to render, then put the cursor on the first problem.
            window.setTimeout(() => {
                formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
            }, 0);
        }
    };

    const phoneError = errorFor("phone");
    const phoneDigits = formData.phone.replace(/\D/g, "").length;

    return (
        <form
            id={BOOKING_DETAILS_FORM_ID}
            ref={formRef}
            onSubmit={handleSubmit}
            noValidate
            className="space-y-5"
        >
            <div>
                <h2 className="heading-sm">Your details</h2>
                <p className="mt-1 text-body-sm">
                    We&apos;ll send your booking confirmation here. One set of details covers all
                    your guests.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id={ids.firstName} label="First name" required error={errorFor("firstName")}>
                    <div className={boxClassName(Boolean(errorFor("firstName")))}>
                        <input
                            id={ids.firstName}
                            name="firstName"
                            value={formData.firstName}
                            onChange={(event) => onFieldChange("firstName", event.target.value)}
                            onBlur={() => markTouched("firstName")}
                            autoComplete="given-name"
                            autoCapitalize="words"
                            spellCheck={false}
                            required
                            aria-required="true"
                            aria-invalid={Boolean(errorFor("firstName"))}
                            aria-describedby={describedBy(
                                ids.firstName,
                                errorFor("firstName"),
                                false
                            )}
                            className={inputClassName}
                        />
                    </div>
                </Field>
                <Field id={ids.lastName} label="Last name" required error={errorFor("lastName")}>
                    <div className={boxClassName(Boolean(errorFor("lastName")))}>
                        <input
                            id={ids.lastName}
                            name="lastName"
                            value={formData.lastName}
                            onChange={(event) => onFieldChange("lastName", event.target.value)}
                            onBlur={() => markTouched("lastName")}
                            autoComplete="family-name"
                            autoCapitalize="words"
                            spellCheck={false}
                            required
                            aria-required="true"
                            aria-invalid={Boolean(errorFor("lastName"))}
                            aria-describedby={describedBy(
                                ids.lastName,
                                errorFor("lastName"),
                                false
                            )}
                            className={inputClassName}
                        />
                    </div>
                </Field>
            </div>

            <Field id={ids.email} label="Email" required error={errorFor("email")}>
                <div className={boxClassName(Boolean(errorFor("email")))}>
                    <input
                        id={ids.email}
                        name="email"
                        type="email"
                        inputMode="email"
                        value={formData.email}
                        onChange={(event) => onFieldChange("email", event.target.value)}
                        onBlur={() => markTouched("email")}
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        placeholder="you@example.com"
                        required
                        aria-required="true"
                        aria-invalid={Boolean(errorFor("email"))}
                        aria-describedby={describedBy(ids.email, errorFor("email"), false)}
                        className={inputClassName}
                    />
                </div>
            </Field>

            <Field
                id={ids.phone}
                label="Mobile number"
                required
                error={phoneError}
                hint={
                    <>
                        {PHONE_DIGITS} digits, without +91 or spaces, e.g. 9876543210.{" "}
                        <span aria-hidden="true" className="tabular-nums">
                            {phoneDigits}/{PHONE_DIGITS}
                        </span>
                    </>
                }
            >
                <div className={boxClassName(Boolean(phoneError))}>
                    <span
                        aria-hidden="true"
                        className="inline-flex items-center border-r border-clay bg-cream-200 px-3 text-sm font-inter font-semibold text-dark-secondary"
                    >
                        +91
                    </span>
                    <input
                        id={ids.phone}
                        name="phone"
                        type="tel"
                        inputMode="numeric"
                        value={formData.phone}
                        onChange={(event) =>
                            onFieldChange("phone", normalizePhoneInput(event.target.value))
                        }
                        onBlur={() => markTouched("phone")}
                        autoComplete="tel-national"
                        placeholder="98765 43210"
                        required
                        aria-required="true"
                        aria-invalid={Boolean(phoneError)}
                        aria-describedby={describedBy(ids.phone, phoneError, true)}
                        className={inputClassName}
                    />
                </div>
            </Field>

            <Field
                id={ids.notes}
                label="Anything we should know?"
                hint="Dietary needs, accessibility, a surprise for the group."
            >
                <div className={boxClassName(false)}>
                    <textarea
                        id={ids.notes}
                        name="notes"
                        value={formData.notes}
                        onChange={(event) => onFieldChange("notes", event.target.value)}
                        rows={3}
                        maxLength={500}
                        aria-describedby={`${ids.notes}-hint`}
                        className={`${inputClassName} resize-none`}
                    />
                </div>
            </Field>

            <button
                type="submit"
                disabled={isBusy || continueDisabled}
                className="btn-primary hidden w-full !py-3.5 disabled:cursor-not-allowed disabled:opacity-50 lg:inline-flex"
            >
                {isBusy ? (
                    <>
                        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                        {continueLabel}
                    </>
                ) : (
                    <>
                        {continueLabel}
                        <ArrowRight className="h-5 w-5" aria-hidden="true" />
                    </>
                )}
            </button>
        </form>
    );
}
