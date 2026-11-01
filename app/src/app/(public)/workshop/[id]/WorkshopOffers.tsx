"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, MessageCircle, Tag, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { formatOfferEnd, type CodeStatus, type OfferRow } from "./workshop-pricing";

export interface WorkshopOffersProps {
    rows: OfferRow[];
    /** Null before mount: offer end dates are rendered after mount only. */
    nowMs: number | null;
    /** Sanitised WhatsApp community link. The community teaser is hidden without it. */
    communityUrl: string | null;
    /** The visitor's code (upper-case) while one is applied, whatever its status. */
    appliedCode: string | null;
    codeStatus: CodeStatus;
    /** Plain-words reason when codeStatus is "rejected". */
    codeRejectionText: string | null;
    /** The code being checked by the server right now ("Applying..."). */
    applyingCode: string | null;
    codeError: string | null;
    /** Put back in the code field after a failed check, so one tap retries it. */
    retryCode: string | null;
    /** Set when a signed-out visitor tried a code: the login link that keeps it. */
    signInHref: string | null;
    guests: number;
    /**
     * The coupon offer in the price and what it takes off, so a smaller offer can say what the
     * applied one saves instead (one offer applies per booking: the one that saves the most).
     */
    appliedOfferLabel?: string | null;
    appliedOfferSaves?: number;
    onApplyCode: (code: string) => void;
    onRemoveCode: () => void;
    onCommunityClick?: () => void;
    /** Keeps the field ids of the two copies (sidebar, phone) apart. */
    idPrefix: string;
}

function StatusLine({
    row,
    guests,
    id,
    appliedLabel,
    appliedSaves,
}: {
    row: OfferRow;
    guests: number;
    id: string;
    appliedLabel: string | null;
    appliedSaves: number;
}) {
    const minGuests = row.offer.minGuests ?? 0;
    if (row.status === "applied" && row.offer.kind !== "early_bird" && row.saves) {
        return (
            <p id={id} className="mt-1 text-[11px] font-inter font-semibold text-emerald-800">
                {`Applied to your booking: saves you ${formatCurrency(row.saves)}.`}
            </p>
        );
    }
    if (row.status === "available" && row.saves) {
        return (
            <p id={id} className="mt-1 text-[11px] font-inter text-dark-muted">
                {appliedSaves > 0
                    ? `Saves you ${formatCurrency(row.saves)} instead of the ${formatCurrency(appliedSaves)} you get now. One offer applies per booking.`
                    : `Would save you ${formatCurrency(row.saves)} on this booking.`}
            </p>
        );
    }
    if (row.status === "needs_seats") {
        return (
            <p id={id} className="mt-1 text-[11px] font-inter text-dark-muted">
                {`Applies when you book ${minGuests}+ seats (you have ${guests}).`}
            </p>
        );
    }
    if (row.status === "needs_order") {
        return (
            <p id={id} className="mt-1 text-[11px] font-inter text-dark-muted">
                Your booking is below this offer&apos;s minimum order.
            </p>
        );
    }
    if (row.status === "better_applied") {
        // Both amounts, so it is plain why this one is not used: it saves less.
        return (
            <p id={id} className="mt-1 text-[11px] font-inter text-dark-muted">
                {row.saves && appliedLabel && appliedSaves > 0
                    ? `Not used: it saves ${formatCurrency(row.saves)}, but ${appliedLabel} saves you ${formatCurrency(appliedSaves)}. One offer applies per booking, the one that saves the most.`
                    : "A bigger offer is applied. One offer per booking."}
            </p>
        );
    }
    return null;
}

/**
 * "Available offers": the workshop's Early Bird, auto offers, listed codes with one-tap Apply,
 * the community teaser and group offers, each with its details line (offerDetailsText) and how
 * it stands for this booking, plus the field for any other code. Every amount it implies comes
 * from the shared quote (workshop-pricing.ts); nothing here computes a price.
 */
export default function WorkshopOffers({
    rows,
    nowMs,
    communityUrl,
    appliedCode,
    codeStatus,
    codeRejectionText,
    applyingCode,
    codeError,
    retryCode,
    signInHref,
    guests,
    appliedOfferLabel = null,
    appliedOfferSaves = 0,
    onApplyCode,
    onRemoveCode,
    onCommunityClick,
    idPrefix,
}: WorkshopOffersProps) {
    const [showCodeInput, setShowCodeInput] = useState(false);
    const [codeInput, setCodeInput] = useState("");

    useEffect(() => {
        if (!retryCode) return;
        setCodeInput(retryCode);
        setShowCodeInput(true);
    }, [retryCode]);

    const visibleRows = rows.filter((row) => row.offer.kind !== "community" || communityUrl);
    // A listed code shows its state on its own row; any other code gets the line under the field.
    const codeRow = appliedCode
        ? (visibleRows.find(
              (row) => row.offer.kind === "listed" && row.offer.code?.toUpperCase() === appliedCode
          ) ?? null)
        : null;
    // The rule, stated once where offers compete: Early Bird (if the workshop has one) comes on
    // top, and of the other offers only the one that saves the most applies.
    const competingOffers = visibleRows.filter((row) => row.offer.kind !== "early_bird").length;
    const hasEarlyBird = visibleRows.some((row) => row.offer.kind === "early_bird");
    const rule = hasEarlyBird
        ? "Early Bird applies, plus one more offer: the one that saves you the most."
        : "One offer applies to each booking: the one that saves you the most.";
    const titleId = `${idPrefix}-offers-title`;
    const inputId = `${idPrefix}-coupon-code`;
    // What a typed code that loses says, with the offer that beat it.
    const beatenBy =
        appliedOfferLabel && appliedOfferSaves > 0
            ? `${appliedOfferLabel} saves you more (${formatCurrency(appliedOfferSaves)})`
            : "a bigger offer is already applied";
    const typedCode = codeInput.trim().toUpperCase();
    // Read out by screen readers when the code's state changes (the visible line is not live).
    const statusMessage = applyingCode
        ? `Checking code ${applyingCode}.`
        : !appliedCode
          ? ""
          : codeStatus === "applied"
            ? `Code ${appliedCode} applied. The total is updated.`
            : codeStatus === "checking"
              ? `Checking code ${appliedCode} for ${guests} seat${guests === 1 ? "" : "s"}.`
              : codeStatus === "better_offer"
                ? `Code ${appliedCode} is valid, but ${beatenBy}. One offer applies per booking.`
                : codeStatus === "rejected"
                  ? `Code ${appliedCode} cannot be used: ${
                        codeRejectionText ?? "it does not apply to this booking."
                    }`
                  : "";

    const submitCode = () => {
        if (!typedCode) return;
        onApplyCode(typedCode);
    };

    return (
        <section aria-labelledby={visibleRows.length > 0 ? titleId : undefined}>
            {visibleRows.length > 0 && (
                <>
                    <p
                        id={titleId}
                        className="mb-2 text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted"
                    >
                        Available offers
                    </p>
                    {competingOffers >= 2 && (
                        <p
                            className="-mt-1 mb-2 text-xs font-inter text-dark-secondary"
                            data-testid="offers-rule"
                        >
                            {rule}
                        </p>
                    )}
                    <ul className="space-y-2">
                        {visibleRows.map((row) => {
                            const { offer } = row;
                            const applied = row.status === "applied";
                            const end = nowMs !== null ? formatOfferEnd(offer.endsAt) : null;
                            const isThisCode =
                                Boolean(appliedCode) &&
                                offer.kind === "listed" &&
                                offer.code?.toUpperCase() === appliedCode;
                            const isApplying =
                                Boolean(applyingCode) && offer.code?.toUpperCase() === applyingCode;
                            // The server would refuse the code for this booking: say why instead.
                            const notYetApplicable =
                                row.status === "needs_seats" || row.status === "needs_order";
                            const statusId = `${idPrefix}-status-${offer.id}`;
                            return (
                                <li
                                    key={offer.id}
                                    className={`rounded-xl border px-3 py-2.5 ${
                                        applied
                                            ? "border-emerald-200 bg-emerald-50"
                                            : "border-clay/40 bg-cream-100/60"
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="flex items-center gap-1.5 text-sm font-inter font-semibold text-dark">
                                                <Tag
                                                    className="h-3.5 w-3.5 shrink-0 text-emerald-700"
                                                    aria-hidden="true"
                                                />
                                                <span className="min-w-0">{offer.label}</span>
                                            </p>
                                            {row.details && (
                                                <p className="mt-0.5 text-xs font-inter text-dark-secondary">
                                                    {row.details}
                                                </p>
                                            )}
                                            {end && (
                                                <p className="mt-0.5 text-[11px] font-inter text-dark-muted">
                                                    {end}
                                                </p>
                                            )}
                                            <StatusLine
                                                row={row}
                                                guests={guests}
                                                id={statusId}
                                                appliedLabel={appliedOfferLabel}
                                                appliedSaves={appliedOfferSaves}
                                            />
                                            {offer.kind === "community" &&
                                                communityUrl &&
                                                !applied && (
                                                    <a
                                                        href={communityUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={onCommunityClick}
                                                        className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-inter font-semibold text-emerald-700 hover:text-emerald-900 transition-colors"
                                                    >
                                                        <MessageCircle
                                                            className="h-3.5 w-3.5"
                                                            aria-hidden="true"
                                                        />
                                                        Get the code in our WhatsApp community
                                                    </a>
                                                )}
                                            {offer.kind === "listed" && offer.code && (
                                                <p className="mt-1.5">
                                                    <span className="inline-flex rounded-md border border-dashed border-terracotta/50 bg-white px-2 py-0.5 font-mono text-xs font-semibold tracking-wider text-terracotta">
                                                        {offer.code}
                                                    </span>
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex shrink-0 flex-col items-end gap-1">
                                            {applied ? (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-inter font-bold uppercase tracking-tight text-emerald-800">
                                                    <Check className="h-3 w-3" aria-hidden="true" />
                                                    {offer.kind === "auto"
                                                        ? "Best offer applied"
                                                        : "Applied"}
                                                </span>
                                            ) : offer.kind === "listed" &&
                                              offer.code &&
                                              !isThisCode &&
                                              row.status !== "better_applied" ? (
                                                <button
                                                    type="button"
                                                    onClick={() => onApplyCode(offer.code ?? "")}
                                                    disabled={
                                                        Boolean(applyingCode) || notYetApplicable
                                                    }
                                                    aria-label={`Apply code ${offer.code}`}
                                                    aria-describedby={
                                                        notYetApplicable ? statusId : undefined
                                                    }
                                                    className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-dark px-3.5 py-1 text-xs font-inter font-semibold text-white transition-colors hover:bg-dark-hover disabled:cursor-not-allowed disabled:opacity-60"
                                                >
                                                    {isApplying ? "Applying..." : "Apply"}
                                                </button>
                                            ) : null}
                                            {isThisCode && (
                                                <button
                                                    type="button"
                                                    onClick={onRemoveCode}
                                                    className="inline-flex items-center gap-1 text-[11px] font-inter font-medium text-dark-muted hover:text-dark transition-colors"
                                                    aria-label={`Remove code ${offer.code}`}
                                                >
                                                    <X className="h-3 w-3" aria-hidden="true" />
                                                    Remove
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}

            <div className={visibleRows.length > 0 ? "mt-3" : ""}>
                {appliedCode && !codeRow ? (
                    <div
                        className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-xs font-inter ${
                            codeStatus === "applied"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : "border-clay/40 bg-cream-100/60 text-dark-secondary"
                        }`}
                    >
                        <p className="min-w-0">
                            <span className="font-semibold">Code {appliedCode}</span>
                            {codeStatus === "applied"
                                ? " applied."
                                : codeStatus === "checking"
                                  ? ` - checking it for ${guests} seat${guests === 1 ? "" : "s"}...`
                                  : codeStatus === "better_offer"
                                    ? ` is valid, but ${beatenBy}. One offer applies per booking.`
                                    : `: ${codeRejectionText ?? "it cannot be used for this booking."}`}
                        </p>
                        <button
                            type="button"
                            onClick={onRemoveCode}
                            className="inline-flex shrink-0 items-center gap-1 font-medium text-dark-muted hover:text-dark transition-colors"
                            aria-label={`Remove code ${appliedCode}`}
                        >
                            <X className="h-3 w-3" aria-hidden="true" />
                            Remove
                        </button>
                    </div>
                ) : codeRow && codeStatus === "rejected" && codeRejectionText ? (
                    <p className="text-xs font-inter text-dark-secondary">
                        {`Code ${appliedCode}: ${codeRejectionText}`}
                    </p>
                ) : !appliedCode && !showCodeInput ? (
                    <button
                        type="button"
                        onClick={() => setShowCodeInput(true)}
                        className="inline-flex items-center gap-1.5 text-sm font-inter font-medium text-terracotta transition-colors hover:text-terracotta/80"
                    >
                        <Tag className="h-4 w-4" aria-hidden="true" />
                        Have a coupon code?
                    </button>
                ) : !appliedCode ? (
                    <form
                        className="space-y-2"
                        onSubmit={(event) => {
                            event.preventDefault();
                            submitCode();
                        }}
                    >
                        <label htmlFor={inputId} className="sr-only">
                            Coupon code
                        </label>
                        <div className="flex gap-2">
                            <input
                                id={inputId}
                                type="text"
                                placeholder="Discount code"
                                autoComplete="off"
                                autoCapitalize="characters"
                                autoCorrect="off"
                                spellCheck={false}
                                value={codeInput}
                                onChange={(event) => setCodeInput(event.target.value.toUpperCase())}
                                className="min-w-0 flex-1 rounded-xl border border-clay/50 bg-white px-3 py-2 text-sm font-inter text-dark transition-all focus:border-terracotta focus:outline-none focus:ring-1 focus:ring-terracotta/30"
                            />
                            <button
                                type="submit"
                                disabled={!typedCode || Boolean(applyingCode)}
                                className="inline-flex min-w-[88px] items-center justify-center rounded-xl bg-dark px-4 py-2 text-sm font-inter font-medium text-white transition-colors hover:bg-dark-hover disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {applyingCode && applyingCode === typedCode ? (
                                    <>
                                        <Loader2
                                            className="mr-1.5 h-4 w-4 animate-spin"
                                            aria-hidden="true"
                                        />
                                        Applying...
                                    </>
                                ) : (
                                    "Apply"
                                )}
                            </button>
                        </div>
                    </form>
                ) : null}

                <div aria-live="polite">
                    {codeError && (
                        <p className="mt-2 text-xs font-inter text-red-600">
                            {codeError}
                            {signInHref && (
                                <>
                                    {" "}
                                    <Link
                                        href={signInHref}
                                        className="font-semibold text-terracotta underline underline-offset-2 hover:text-terracotta/80"
                                    >
                                        Log in
                                    </Link>
                                </>
                            )}
                        </p>
                    )}
                </div>
                <p className="sr-only" role="status">
                    {statusMessage}
                </p>
            </div>
        </section>
    );
}
