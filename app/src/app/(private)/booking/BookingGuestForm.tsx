"use client";

import { Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { BookingFormData, FormErrors } from "./types";

function inputClassName(hasError: boolean) {
    return `w-full bg-cream-100 border rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none ${
        hasError ? "border-red-400 focus:border-red-500" : "border-gray-200 focus:border-terracotta"
    }`;
}

export default function BookingGuestForm({
    formData,
    formErrors,
    onFieldChange,
    onCheckout,
    isCheckoutDisabled,
    isRazorpayReady,
    submitting,
    total,
}: {
    formData: BookingFormData;
    formErrors: FormErrors;
    onFieldChange: (field: keyof BookingFormData, value: string) => void;
    onCheckout: () => void;
    isCheckoutDisabled: boolean;
    isRazorpayReady: boolean;
    submitting: boolean;
    total: number;
}) {
    return (
        <div className="bg-white rounded-2xl p-6 shadow-soft space-y-5">
            <h2 className="heading-sm">Guest Information</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="mb-1.5 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                        First name <span className="text-red-500">*</span>
                    </label>
                    <input
                        value={formData.firstName}
                        onChange={(event) => onFieldChange("firstName", event.target.value)}
                        placeholder="First name"
                        autoComplete="given-name"
                        aria-invalid={Boolean(formErrors.firstName)}
                        className={inputClassName(Boolean(formErrors.firstName))}
                    />
                    {formErrors.firstName && (
                        <p className="mt-1 text-xs font-inter text-red-600">
                            {formErrors.firstName}
                        </p>
                    )}
                </div>
                <div>
                    <label className="mb-1.5 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                        Last name <span className="text-red-500">*</span>
                    </label>
                    <input
                        value={formData.lastName}
                        onChange={(event) => onFieldChange("lastName", event.target.value)}
                        placeholder="Last name"
                        autoComplete="family-name"
                        aria-invalid={Boolean(formErrors.lastName)}
                        className={inputClassName(Boolean(formErrors.lastName))}
                    />
                    {formErrors.lastName && (
                        <p className="mt-1 text-xs font-inter text-red-600">
                            {formErrors.lastName}
                        </p>
                    )}
                </div>
            </div>

            <div>
                <label className="mb-1.5 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                    Email <span className="text-red-500">*</span>
                </label>
                <input
                    type="email"
                    value={formData.email}
                    onChange={(event) => onFieldChange("email", event.target.value)}
                    placeholder="Email"
                    autoComplete="email"
                    aria-invalid={Boolean(formErrors.email)}
                    className={inputClassName(Boolean(formErrors.email))}
                />
                {formErrors.email && (
                    <p className="mt-1 text-xs font-inter text-red-600">{formErrors.email}</p>
                )}
            </div>

            <div>
                <label className="mb-1.5 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                    Phone number <span className="text-red-500">*</span>
                </label>
                <input
                    type="tel"
                    value={formData.phone}
                    onChange={(event) => onFieldChange("phone", event.target.value)}
                    placeholder="10-digit phone number"
                    autoComplete="tel"
                    inputMode="numeric"
                    aria-invalid={Boolean(formErrors.phone)}
                    className={inputClassName(Boolean(formErrors.phone))}
                />
                {formErrors.phone ? (
                    <p className="mt-1 text-xs font-inter text-red-600">{formErrors.phone}</p>
                ) : (
                    <p className="mt-1 text-xs font-inter text-dark-muted">
                        Enter 10 digits without spaces.
                    </p>
                )}
            </div>

            <textarea
                value={formData.notes}
                onChange={(event) => onFieldChange("notes", event.target.value)}
                rows={3}
                placeholder="Special requests (optional)"
                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta resize-none"
            />

            <button
                onClick={onCheckout}
                disabled={isCheckoutDisabled}
                className="btn-primary hidden sm:inline-flex w-full sm:w-auto !py-3.5 !px-8 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {submitting ? (
                    <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Processing...
                    </>
                ) : !isRazorpayReady ? (
                    <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Loading payment...
                    </>
                ) : (
                    <>Confirm & Pay {formatCurrency(total)}</>
                )}
            </button>
        </div>
    );
}
