"use client";

import { Tag, X } from "lucide-react";
import type { Quote } from "@/lib/pricing";
import { formatCurrency } from "@/lib/utils";

export interface WorkshopPriceBreakdownProps {
    quote: Quote;
    /** Name of the Early Bird line (the offer label), when Early Bird is in the price. */
    earlyBirdLabel: string | null;
    /** Name of the coupon line, when a coupon is in the price. */
    couponLabel: string | null;
    /** True when the coupon line is the visitor's code: it gets a remove button. */
    codeInPrice: boolean;
    onRemoveCode: () => void;
}

/**
 * The booking's lines exactly as checkout charges them: list price x guests, Early Bird, at most
 * one offer, the service fee and the total, all from one computeQuote result. Per-person x
 * guests is the LIST price on purpose: Early Bird is rounded down on the whole subtotal, so a
 * discounted per-person figure times the guests could differ from the charge by a rupee or more.
 */
export default function WorkshopPriceBreakdown({
    quote,
    earlyBirdLabel,
    couponLabel,
    codeInPrice,
    onRemoveCode,
}: WorkshopPriceBreakdownProps) {
    return (
        <div className="space-y-3">
            <div className="flex justify-between gap-3 text-sm font-inter">
                <span className="text-dark-secondary">
                    {formatCurrency(quote.listUnitPrice)} &times; {quote.guests}{" "}
                    {quote.guests === 1 ? "guest" : "guests"}
                </span>
                <span className="font-medium text-dark">{formatCurrency(quote.listSubtotal)}</span>
            </div>
            {quote.earlyBirdDiscount > 0 && (
                <div className="flex justify-between gap-3 text-sm font-inter text-emerald-700">
                    <span className="min-w-0">{earlyBirdLabel || "Early bird"}</span>
                    <span className="shrink-0 font-medium">
                        -{formatCurrency(quote.earlyBirdDiscount)}
                    </span>
                </div>
            )}
            {quote.couponDiscount > 0 && (
                <div className="flex justify-between gap-3 text-sm font-inter text-emerald-700">
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="min-w-0">{couponLabel || "Offer"}</span>
                        {codeInPrice && (
                            <button
                                type="button"
                                onClick={onRemoveCode}
                                className="rounded-full p-0.5 transition-colors hover:text-emerald-900"
                                aria-label="Remove coupon"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        )}
                    </span>
                    <span className="shrink-0 font-medium">
                        -{formatCurrency(quote.couponDiscount)}
                    </span>
                </div>
            )}
            <div className="flex justify-between gap-3 text-sm font-inter">
                <span className="text-dark-secondary">Service fee</span>
                <span className="font-medium text-dark">{formatCurrency(quote.serviceFee)}</span>
            </div>
            <div className="flex justify-between border-t border-dashed border-clay/50 pt-3 text-base font-inter font-bold">
                <span className="text-dark">Total</span>
                <span className="text-dark">{formatCurrency(quote.total)}</span>
            </div>
            {quote.savings > 0 && (
                <p className="text-right text-xs font-inter font-semibold text-emerald-700">
                    You save {formatCurrency(quote.savings)}
                </p>
            )}
            <p className="text-right text-[11px] font-inter text-dark-muted">Inclusive of GST</p>
        </div>
    );
}
