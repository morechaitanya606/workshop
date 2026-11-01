"use client";

import Image from "next/image";
import { useId } from "react";
import { Calendar, Clock, Loader2, MapPin, ShieldCheck, Tag, Users, X } from "lucide-react";
import type { Workshop } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/utils";
import { isWebUrl } from "@/lib/workshop-media";
import { formatOfferEnd, type BookingOfferItem, type BookingPriceLines } from "./booking-pricing";

/** Shown while the service fee (and so the total) is not known yet: never a guessed amount. */
function AmountPlaceholder({ label }: { label: string }) {
    return (
        <span
            role="img"
            aria-label={label}
            className="inline-block h-4 w-12 animate-pulse rounded bg-cream-200 align-middle"
        />
    );
}

function OfferEnd({ endsAt, mounted }: { endsAt: string | null; mounted: boolean }) {
    // The real end, rendered after mount only (no server clock in the markup).
    const text = mounted ? formatOfferEnd(endsAt) : "";
    if (!text) return null;
    return <span className="block text-[11px] font-normal text-emerald-700/80">Ends {text}</span>;
}

export default function BookingOrderSummary({
    workshop,
    lines,
    offerItems,
    typedCodeNote,
    appliedCode,
    mounted,
    bookingsClosed,
    communityUrl,
    showCouponInput,
    couponCode,
    isApplyingCoupon,
    couponError,
    onShowCouponInput,
    onCouponCodeChange,
    onApplyCoupon,
    onApplyOfferCode,
    onRemoveCoupon,
}: {
    workshop: Workshop;
    /** The price to show: the server's quote once an order exists, else the local quote. */
    lines: BookingPriceLines | null;
    offerItems: BookingOfferItem[];
    typedCodeNote: string | null;
    /** The code the customer applied (typed or tapped), whether or not it is in the price. */
    appliedCode: string | null;
    mounted: boolean;
    bookingsClosed: boolean;
    communityUrl?: string;
    showCouponInput: boolean;
    couponCode: string;
    isApplyingCoupon: boolean;
    couponError: string;
    onShowCouponInput: () => void;
    onCouponCodeChange: (value: string) => void;
    onApplyCoupon: () => void;
    onApplyOfferCode: (code: string) => void;
    onRemoveCoupon: () => void;
}) {
    const couponInputId = useId();
    // A pasted Maps link is not an address to print; show the venue and city instead.
    const locationLabel =
        workshop.eventAddress && !isWebUrl(workshop.eventAddress)
            ? workshop.eventAddress
            : `${workshop.location}, ${workshop.city}`;
    const guests = lines?.guests ?? 1;
    const guestLabel = `${guests} ${guests === 1 ? "guest" : "guests"}`;
    const savings = lines?.savings ?? 0;
    const offerLine = lines?.offerLine ?? null;
    const showOffers = !bookingsClosed && offerItems.length > 0;

    return (
        <div>
            <h3 className="mb-4 text-sm font-inter font-bold uppercase tracking-wider text-dark-muted">
                Order summary
            </h3>

            <div className="flex gap-3">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-cream-200">
                    <Image
                        src={workshop.coverImage}
                        alt=""
                        fill
                        sizes="80px"
                        className="object-cover"
                    />
                </div>
                <div className="min-w-0">
                    <h4 className="font-playfair text-base font-semibold leading-tight text-dark">
                        {workshop.title}
                    </h4>
                </div>
            </div>

            <ul className="mt-4 space-y-2 border-t border-clay/40 py-4 text-sm font-inter text-dark-secondary">
                <li className="flex items-start gap-2.5">
                    <Calendar
                        className="mt-0.5 h-4 w-4 shrink-0 text-dark-muted"
                        aria-hidden="true"
                    />
                    <span>
                        {formatDate(workshop.date)} <span aria-hidden="true">&middot;</span>{" "}
                        {workshop.time}
                    </span>
                </li>
                <li className="flex items-start gap-2.5">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-dark-muted" aria-hidden="true" />
                    {workshop.duration}
                </li>
                <li className="flex items-start gap-2.5">
                    <MapPin
                        className="mt-0.5 h-4 w-4 shrink-0 text-dark-muted"
                        aria-hidden="true"
                    />
                    <span className="min-w-0 break-words">{locationLabel}</span>
                </li>
                <li className="flex items-start gap-2.5">
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-dark-muted" aria-hidden="true" />
                    {guestLabel}
                </li>
            </ul>

            {lines && (
                <dl className="space-y-2 border-t border-clay/40 pt-4 text-sm font-inter">
                    <div className="flex justify-between gap-3">
                        <dt className="text-dark-secondary">
                            {formatCurrency(lines.listUnitPrice)} &times; {guestLabel}
                        </dt>
                        <dd
                            className={
                                savings > 0
                                    ? "text-dark-muted line-through"
                                    : "font-medium text-dark"
                            }
                        >
                            {formatCurrency(lines.listSubtotal)}
                        </dd>
                    </div>
                    {lines.earlyBirdDiscount > 0 && (
                        <div className="flex justify-between gap-3 text-emerald-700">
                            <dt className="min-w-0">
                                <span className="flex items-center gap-1">
                                    <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                    Early Bird offer
                                </span>
                                <OfferEnd endsAt={lines.earlyBirdEndsAt} mounted={mounted} />
                            </dt>
                            <dd className="shrink-0 font-medium">
                                -{formatCurrency(lines.earlyBirdDiscount)}
                            </dd>
                        </div>
                    )}
                    {offerLine && offerLine.amount > 0 && (
                        <div className="flex justify-between gap-3 text-emerald-700">
                            <dt className="min-w-0">
                                <span className="flex items-center gap-1">
                                    <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                    <span className="min-w-0 break-words">{offerLine.label}</span>
                                    {offerLine.code && (
                                        <button
                                            type="button"
                                            onClick={onRemoveCoupon}
                                            className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                                            aria-label={`Remove coupon ${offerLine.code}`}
                                        >
                                            <X className="h-3 w-3" aria-hidden="true" />
                                        </button>
                                    )}
                                </span>
                                <OfferEnd endsAt={offerLine.endsAt} mounted={mounted} />
                            </dt>
                            <dd className="shrink-0 font-medium">
                                -{formatCurrency(offerLine.amount)}
                            </dd>
                        </div>
                    )}
                    <div className="flex justify-between gap-3">
                        <dt className="text-dark-secondary">Service fee</dt>
                        <dd className="font-medium text-dark">
                            {lines.serviceFee === null ? (
                                <AmountPlaceholder label="Service fee loading" />
                            ) : (
                                formatCurrency(lines.serviceFee)
                            )}
                        </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-t border-clay/40 pt-3">
                        <dt className="font-inter text-base font-bold text-dark">Total</dt>
                        <dd className="font-playfair text-2xl font-medium text-dark">
                            {lines.total === null ? (
                                <AmountPlaceholder label="Total loading" />
                            ) : (
                                formatCurrency(lines.total)
                            )}
                        </dd>
                    </div>
                    {savings > 0 && (
                        <div className="flex justify-end">
                            <dt className="sr-only">Your savings</dt>
                            <dd className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                                You save {formatCurrency(savings)}
                            </dd>
                        </div>
                    )}
                </dl>
            )}
            <p className="mt-1 text-right text-xs font-inter text-dark-muted">
                All prices are inclusive of GST.
            </p>

            {typedCodeNote && (
                <div
                    role="status"
                    className="mt-3 flex items-start justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-inter text-amber-900"
                >
                    <span className="min-w-0">{typedCodeNote}</span>
                    {appliedCode && (
                        <button
                            type="button"
                            onClick={onRemoveCoupon}
                            className="shrink-0 rounded-full px-2 font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                            aria-label={`Remove coupon ${appliedCode}`}
                        >
                            Remove
                        </button>
                    )}
                </div>
            )}

            {showOffers && (
                <div className="mt-4 border-t border-clay/40 pt-4">
                    <h4 className="mb-2 text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                        Available offers
                    </h4>
                    <ul className="space-y-2">
                        {offerItems.map((item) => (
                            <li
                                key={item.id}
                                className="flex items-start justify-between gap-3 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/60 px-3 py-2.5 text-sm font-inter"
                            >
                                <div className="min-w-0">
                                    <p className="flex items-center gap-1 font-semibold text-emerald-800">
                                        <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                        <span className="min-w-0 break-words">{item.label}</span>
                                    </p>
                                    <p className="mt-0.5 text-xs text-dark-secondary">
                                        {item.details}
                                    </p>
                                    {item.kind === "community" && (
                                        <p className="mt-0.5 text-xs text-dark-muted">
                                            The code is shared in our WhatsApp community.{" "}
                                            {communityUrl && (
                                                <a
                                                    href={communityUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="font-semibold text-terracotta underline-offset-2 hover:underline"
                                                >
                                                    Join the community
                                                </a>
                                            )}
                                        </p>
                                    )}
                                    {mounted && formatOfferEnd(item.endsAt) && (
                                        <p className="mt-0.5 text-[11px] text-dark-muted">
                                            Ends {formatOfferEnd(item.endsAt)}
                                        </p>
                                    )}
                                </div>
                                {item.code && (
                                    <button
                                        type="button"
                                        onClick={() => item.code && onApplyOfferCode(item.code)}
                                        disabled={isApplyingCoupon}
                                        aria-label={`Apply ${item.label}`}
                                        className="shrink-0 rounded-full border border-emerald-600 px-3 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
                                    >
                                        Apply
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {!bookingsClosed && !appliedCode && (
                <div className="mt-4 border-t border-clay/40 pt-4">
                    {!showCouponInput ? (
                        <button
                            type="button"
                            onClick={onShowCouponInput}
                            className="inline-flex items-center gap-1.5 rounded text-sm font-inter font-medium text-terracotta transition-colors hover:text-terracotta-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                        >
                            <Tag className="h-4 w-4" aria-hidden="true" /> Have a coupon code?
                        </button>
                    ) : (
                        <div className="space-y-2">
                            <label htmlFor={couponInputId} className="sr-only">
                                Discount code
                            </label>
                            <div className="flex gap-2">
                                <input
                                    id={couponInputId}
                                    type="text"
                                    placeholder="Discount code"
                                    autoComplete="off"
                                    autoCapitalize="characters"
                                    spellCheck={false}
                                    value={couponCode}
                                    onChange={(event) => onCouponCodeChange(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                            event.preventDefault();
                                            onApplyCoupon();
                                        }
                                    }}
                                    aria-invalid={Boolean(couponError)}
                                    aria-describedby={
                                        couponError ? `${couponInputId}-error` : undefined
                                    }
                                    className="min-w-0 flex-1 rounded-xl border border-clay bg-white px-3 py-2 text-base font-inter uppercase placeholder:normal-case focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/20 sm:text-sm"
                                />
                                <button
                                    type="button"
                                    onClick={onApplyCoupon}
                                    disabled={!couponCode.trim() || isApplyingCoupon}
                                    className="flex min-w-[80px] items-center justify-center rounded-xl bg-dark-text px-4 py-2 text-sm font-inter font-medium text-white transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dark-text focus-visible:ring-offset-2 disabled:opacity-50"
                                >
                                    {isApplyingCoupon ? (
                                        <Loader2
                                            className="h-4 w-4 animate-spin"
                                            aria-label="Applying"
                                        />
                                    ) : (
                                        "Apply"
                                    )}
                                </button>
                            </div>
                            {couponError && (
                                <p
                                    id={`${couponInputId}-error`}
                                    role="alert"
                                    className="text-xs font-inter text-red-600"
                                >
                                    {couponError}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}

            <ul className="mt-5 space-y-2.5 rounded-xl bg-cream-100 p-3.5 text-xs font-inter text-dark-secondary">
                <li className="flex items-start gap-2.5">
                    <ShieldCheck
                        className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                        aria-hidden="true"
                    />
                    Secure payment via Razorpay
                </li>
            </ul>
        </div>
    );
}
