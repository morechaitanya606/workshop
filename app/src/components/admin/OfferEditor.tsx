"use client";

import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, Sparkles } from "lucide-react";
import CouponWorkshopPicker, {
    type CouponWorkshopOption,
} from "@/components/admin/CouponWorkshopPicker";
import {
    checkOfferForm,
    formatIst,
    isAdvertised,
    istLocalToIso,
    OFFER_PRESETS,
    OFFER_VISIBILITY_OPTIONS,
    offerPayloadFromForm,
    validUntilFromEnteredEnd,
    type OfferFormState,
    type OfferPayload,
} from "@/components/admin/offer-form";
import {
    OFFER_ADMIN_HINTS,
    OFFER_LABEL_MAX_LENGTH,
    OFFER_MIN_GUESTS_MAX,
    offerDetailsText,
    publicOfferFromCoupon,
} from "@/lib/offers";
import { OFFER_END_GRACE_MINUTES } from "@/lib/pricing";

const inputClass =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-dark outline-none focus:border-terracotta/50 disabled:bg-gray-50";
const labelClass = "mb-1 block text-xs font-inter font-semibold text-dark-muted";

function Field({
    label,
    htmlFor,
    error,
    help,
    children,
}: {
    label: string;
    htmlFor: string;
    error?: string;
    help?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div>
            <label htmlFor={htmlFor} className={labelClass}>
                {label}
            </label>
            {children}
            {error ? (
                <p className="mt-1 text-xs font-inter text-red-600" role="alert">
                    {error}
                </p>
            ) : help ? (
                <p className="mt-1 text-xs font-inter text-dark-muted">{help}</p>
            ) : null}
        </div>
    );
}

type OfferEditorProps = {
    initial: OfferFormState;
    isNew: boolean;
    workshops: CouponWorkshopOption[];
    todayIso: string;
    saving: boolean;
    /** Resolves when the save finished (the parent shows success or the server's error). */
    onSubmit: (payload: OfferPayload) => void | Promise<void>;
    onCancel?: () => void;
    /** The server's answer to the last save, shown above the buttons. */
    serverError?: string | null;
};

/**
 * Create or edit one coupon and how it is shown (src/lib/offers.ts). Mobile first: one column of
 * fields, two from sm. The server re-validates everything (and refuses a label that spells out a
 * non-listed code); these checks only save a round trip.
 */
export default function OfferEditor({
    initial,
    isNew,
    workshops,
    todayIso,
    saving,
    onSubmit,
    onCancel,
    serverError,
}: OfferEditorProps) {
    const id = useId();
    const [form, setForm] = useState<OfferFormState>(initial);
    const [submitted, setSubmitted] = useState(false);
    const check = useMemo(() => checkOfferForm(form, { isNew }), [form, isNew]);
    const errors = submitted ? check.errors : {};
    const hasErrors = Object.keys(check.errors).length > 0;
    const advertised = isAdvertised(form.visibility);

    const update = <K extends keyof OfferFormState>(key: K, value: OfferFormState[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    // What customers would see (the same function the public offer list uses).
    const preview = useMemo(() => {
        if (!advertised || check.errors.discountValue) return null;
        const validUntil = form.endsAt
            ? validUntilFromEnteredEnd(form.endsAt, form.visibility)
            : null;
        const minGuests = Number(form.minGuests) > 1 ? Number(form.minGuests) : null;
        return publicOfferFromCoupon(
            {
                id: "preview",
                code: form.code.trim().toUpperCase(),
                discountType: form.discountType,
                discountValue: Number(form.discountValue),
                minOrderAmount: form.minOrderAmount ? Number(form.minOrderAmount) : null,
                validFrom: form.startsAt ? istLocalToIso(form.startsAt) : null,
                validUntil,
                isActive: true,
                minGuests,
                advertised: true,
            },
            {
                visibility: form.visibility,
                label: form.label.trim() || undefined,
                minGuests: minGuests ?? undefined,
                showEndDate: form.showEndDate,
            }
        );
    }, [advertised, check.errors.discountValue, form]);

    const storedEnd =
        form.endsAt && advertised ? validUntilFromEnteredEnd(form.endsAt, form.visibility) : null;

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSubmitted(true);
        if (hasErrors || saving) return;
        await onSubmit(offerPayloadFromForm(form, { isNew }));
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {isNew && (
                <div>
                    <p className={labelClass}>Start from a preset</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {OFFER_PRESETS.map((preset) => (
                            <button
                                key={preset.id}
                                type="button"
                                onClick={() => setForm((prev) => preset.apply(prev))}
                                disabled={saving}
                                className="flex items-start gap-2 rounded-xl border border-clay/40 bg-white px-3 py-2.5 text-left hover:bg-cream-100 disabled:opacity-60"
                            >
                                <Sparkles
                                    className="mt-0.5 h-4 w-4 shrink-0 text-terracotta"
                                    aria-hidden="true"
                                />
                                <span>
                                    <span className="block text-sm font-inter font-semibold text-dark">
                                        {preset.title}
                                    </span>
                                    <span className="block text-xs font-inter text-dark-muted">
                                        {preset.description}
                                    </span>
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field
                    label="Code"
                    htmlFor={`${id}-code`}
                    error={errors.code}
                    help={isNew ? undefined : "The code cannot be changed."}
                >
                    <input
                        id={`${id}-code`}
                        value={form.code}
                        onChange={(event) => update("code", event.target.value.toUpperCase())}
                        disabled={!isNew || saving}
                        autoComplete="off"
                        placeholder="DIWALI10"
                        className={`${inputClass} font-mono uppercase`}
                    />
                </Field>
                <Field label="Type" htmlFor={`${id}-type`}>
                    <select
                        id={`${id}-type`}
                        value={form.discountType}
                        onChange={(event) =>
                            update(
                                "discountType",
                                event.target.value === "fixed" ? "fixed" : "percentage"
                            )
                        }
                        disabled={saving}
                        className={inputClass}
                    >
                        <option value="percentage">Percentage (%)</option>
                        <option value="fixed">Fixed (Rs per booking)</option>
                    </select>
                </Field>
                <Field label="Amount" htmlFor={`${id}-value`} error={errors.discountValue}>
                    <input
                        id={`${id}-value`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="1"
                        value={form.discountValue}
                        onChange={(event) => update("discountValue", event.target.value)}
                        disabled={saving}
                        className={inputClass}
                    />
                </Field>
            </div>

            <fieldset>
                <legend className={labelClass}>Visibility</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {OFFER_VISIBILITY_OPTIONS.map((option) => {
                        const checked = form.visibility === option.value;
                        return (
                            <label
                                key={option.value}
                                className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2.5 ${
                                    checked
                                        ? "border-terracotta bg-terracotta/5"
                                        : "border-gray-200 bg-white"
                                }`}
                            >
                                <input
                                    type="radio"
                                    name={`${id}-visibility`}
                                    value={option.value}
                                    checked={checked}
                                    onChange={() => update("visibility", option.value)}
                                    disabled={saving}
                                    className="mt-1 accent-terracotta"
                                />
                                <span>
                                    <span className="block text-sm font-inter font-semibold text-dark">
                                        {option.label}
                                    </span>
                                    <span className="block text-xs font-inter text-dark-muted">
                                        {option.help}
                                    </span>
                                </span>
                            </label>
                        );
                    })}
                </div>
            </fieldset>

            <Field
                label={`Label (optional, up to ${OFFER_LABEL_MAX_LENGTH} characters)`}
                htmlFor={`${id}-label`}
                error={errors.label}
                help={OFFER_ADMIN_HINTS.label}
            >
                <input
                    id={`${id}-label`}
                    value={form.label}
                    maxLength={OFFER_LABEL_MAX_LENGTH + 20}
                    onChange={(event) => update("label", event.target.value)}
                    disabled={saving}
                    placeholder="Limited-time offer"
                    className={inputClass}
                />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                    label="Starts (IST, optional)"
                    htmlFor={`${id}-start`}
                    error={errors.startsAt}
                    help={
                        isNew
                            ? "Empty: starts as soon as it is saved."
                            : "Empty keeps the stored start."
                    }
                >
                    <input
                        id={`${id}-start`}
                        type="datetime-local"
                        value={form.startsAt}
                        onChange={(event) => update("startsAt", event.target.value)}
                        disabled={saving}
                        className={inputClass}
                    />
                </Field>
                <Field
                    label={advertised ? "Ends as customers see it (IST)" : "Ends (IST, optional)"}
                    htmlFor={`${id}-end`}
                    error={errors.endsAt}
                    help={
                        advertised
                            ? `${OFFER_ADMIN_HINTS.advertisedEnd}${
                                  storedEnd
                                      ? ` The code itself stays valid until ${formatIst(storedEnd)}.`
                                      : ""
                              }`
                            : "Empty: no end date. A hidden code ends exactly at this time."
                    }
                >
                    <input
                        id={`${id}-end`}
                        type="datetime-local"
                        value={form.endsAt}
                        onChange={(event) => update("endsAt", event.target.value)}
                        disabled={saving}
                        className={inputClass}
                    />
                </Field>
            </div>

            <label className="flex items-start gap-2 text-sm font-inter text-dark">
                <input
                    type="checkbox"
                    checked={form.showEndDate}
                    onChange={(event) => update("showEndDate", event.target.checked)}
                    disabled={saving}
                    className="mt-1 accent-terracotta"
                />
                <span>
                    Show the end date to customers
                    <span className="block text-xs text-dark-muted">
                        Only a real end is shown (never a fake countdown). Needs an end date.
                    </span>
                </span>
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field
                    label="Minimum seats (optional)"
                    htmlFor={`${id}-min-guests`}
                    error={errors.minGuests}
                    help={`2 to ${OFFER_MIN_GUESTS_MAX}. Empty: any booking.`}
                >
                    <input
                        id={`${id}-min-guests`}
                        type="number"
                        inputMode="numeric"
                        min="2"
                        max={OFFER_MIN_GUESTS_MAX}
                        step="1"
                        value={form.minGuests}
                        onChange={(event) => update("minGuests", event.target.value)}
                        disabled={saving}
                        className={inputClass}
                    />
                </Field>
                <Field
                    label="Max uses (optional)"
                    htmlFor={`${id}-max-uses`}
                    error={errors.maxUses}
                    help="Empty: unlimited."
                >
                    <input
                        id={`${id}-max-uses`}
                        type="number"
                        inputMode="numeric"
                        min="1"
                        step="1"
                        value={form.maxUses}
                        onChange={(event) => update("maxUses", event.target.value)}
                        disabled={saving}
                        className={inputClass}
                    />
                </Field>
                <Field
                    label="Minimum order, Rs (optional)"
                    htmlFor={`${id}-min-order`}
                    error={errors.minOrderAmount}
                    help="Measured after Early Bird, before the service fee."
                >
                    <input
                        id={`${id}-min-order`}
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        value={form.minOrderAmount}
                        onChange={(event) => update("minOrderAmount", event.target.value)}
                        disabled={saving}
                        className={inputClass}
                    />
                </Field>
            </div>
            <p className="text-xs font-inter text-dark-muted">{OFFER_ADMIN_HINTS.maxUses}</p>

            <div>
                <CouponWorkshopPicker
                    workshops={workshops}
                    value={form.workshopIds}
                    onChange={(next) => update("workshopIds", next)}
                    todayIso={todayIso}
                    disabled={saving}
                />
                {errors.workshopIds && (
                    <p className="mt-1 text-xs font-inter text-red-600" role="alert">
                        {errors.workshopIds}
                    </p>
                )}
            </div>

            {preview && (
                <div className="rounded-xl border border-clay/30 bg-cream-50 p-3">
                    <p className="text-[11px] font-inter font-bold uppercase tracking-wider text-dark-muted">
                        Customers see
                    </p>
                    <p className="mt-1 text-sm font-inter font-semibold text-dark">
                        {preview.label}
                    </p>
                    {offerDetailsText(preview) && (
                        <p className="text-xs font-inter text-dark-muted">
                            {offerDetailsText(preview)}
                        </p>
                    )}
                    {preview.endsAt && (
                        <p className="text-xs font-inter text-dark-muted">
                            Ends {formatIst(preview.endsAt)}
                        </p>
                    )}
                    {preview.code && (
                        <p className="mt-1 text-xs font-inter text-dark-muted">
                            Code shown: <span className="font-mono">{preview.code}</span>
                        </p>
                    )}
                </div>
            )}

            {check.warnings.length > 0 && (
                <ul className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-inter text-amber-800">
                    {check.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                    ))}
                </ul>
            )}

            <p className="text-xs font-inter text-dark-muted">
                {OFFER_ADMIN_HINTS.publicSettings} Discounts are paid by the platform: hosts are
                paid on the full price. Advertised offers end {OFFER_END_GRACE_MINUTES} minutes
                before the code does.
            </p>

            {serverError && (
                <p
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-inter text-red-700"
                    role="alert"
                >
                    {serverError}
                </p>
            )}
            {submitted && hasErrors && (
                <p className="text-sm font-inter text-red-600" role="alert">
                    Fix the highlighted fields first.
                </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
                <button
                    type="submit"
                    disabled={saving}
                    className="btn-primary !px-4 !py-2 justify-center disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {saving ? "Saving..." : isNew ? "Add offer" : "Save changes"}
                </button>
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={saving}
                        className="btn-secondary !px-4 !py-2 justify-center"
                    >
                        Cancel
                    </button>
                )}
            </div>
        </form>
    );
}
