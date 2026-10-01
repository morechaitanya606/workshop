"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Check, Copy, MessageCircle, X } from "lucide-react";

import { trackEvent } from "@/lib/analytics";
import { CONTACT_PAGE_HREF } from "@/lib/contact";
import { sanitizeWhatsAppCommunityUrl } from "@/lib/platform-settings-schema";
import { useModalA11y } from "@/lib/use-modal-a11y";

const INSTAGRAM_URL = "https://www.instagram.com/only_workshops";

export interface WhatsAppCommunityModalProps {
    open: boolean;
    onClose: () => void;
    /** Raw value from platform settings. Re-validated here, so a bad value never renders. */
    communityUrl?: string | null;
    /** Optional admin-written sentence that replaces the default body text. */
    message?: string | null;
    /** Where the popup was opened from, for analytics only. */
    source?: string;
    workshopId?: string;
}

export function getCommunityModalCopy(hasLink: boolean, customMessage?: string | null) {
    const trimmedMessage = customMessage?.trim();
    if (hasLink) {
        return {
            title: "This workshop is full",
            body:
                trimmedMessage ||
                "All seats are taken, but more dates are on the way. Join our WhatsApp community to hear about the next dates first.",
        };
    }
    return {
        title: "This workshop is full",
        body:
            trimmedMessage ||
            "All seats are taken. Follow us or contact support and we will let you know when new dates open up.",
    };
}

export default function WhatsAppCommunityModal({
    open,
    onClose,
    communityUrl,
    message,
    source = "unknown",
    workshopId,
}: WhatsAppCommunityModalProps) {
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const primaryActionRef = useRef<HTMLElement | null>(null);
    const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
    const titleId = useId();
    const descriptionId = useId();

    const safeUrl = sanitizeWhatsAppCommunityUrl(communityUrl);
    const copy = getCommunityModalCopy(Boolean(safeUrl), message);

    useModalA11y({
        open,
        containerRef: dialogRef,
        onClose,
        initialFocusRef: primaryActionRef,
    });

    useEffect(() => {
        if (open) {
            trackEvent("whatsapp_community_modal_opened", {
                source,
                workshopId,
                hasLink: Boolean(safeUrl),
            });
        } else {
            setCopyState("idle");
        }
        // Fire once per open; the link and source are read at that moment.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(
        () => () => {
            if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        },
        []
    );

    if (!open || typeof document === "undefined") return null;

    const handleCopy = async () => {
        if (!safeUrl) return;
        let nextState: "copied" | "failed" = "failed";
        try {
            await navigator.clipboard.writeText(safeUrl);
            nextState = "copied";
        } catch {
            nextState = "failed";
        }
        setCopyState(nextState);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setCopyState("idle"), 2500);
    };

    return createPortal(
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm motion-safe:animate-fade-in"
            data-testid="whatsapp-community-backdrop"
            onMouseDown={(event) => {
                // Only a press that starts on the backdrop itself closes; a text-selection
                // drag that ends on it must not.
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                tabIndex={-1}
                className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-card outline-none sm:p-8"
            >
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="absolute right-3 top-3 rounded-full p-2 text-dark-muted transition-colors hover:bg-cream-100"
                >
                    <X className="h-5 w-5" aria-hidden="true" />
                </button>

                <div className="mb-6 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
                        <MessageCircle className="h-7 w-7 text-emerald-700" aria-hidden="true" />
                    </div>
                    <h2 id={titleId} className="heading-sm mb-2">
                        {copy.title}
                    </h2>
                    <p id={descriptionId} className="text-sm font-inter text-dark-secondary">
                        {copy.body}
                    </p>
                </div>

                {safeUrl ? (
                    <div className="space-y-3">
                        <a
                            ref={(node) => {
                                primaryActionRef.current = node;
                            }}
                            href={safeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() =>
                                trackEvent("whatsapp_community_join_clicked", {
                                    source,
                                    workshopId,
                                })
                            }
                            className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-700 px-6 py-4 text-base font-inter font-bold text-white shadow-soft transition-colors hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                        >
                            <MessageCircle className="h-5 w-5" aria-hidden="true" />
                            Join WhatsApp Community
                        </a>
                        <button
                            type="button"
                            onClick={() => void handleCopy()}
                            className="flex w-full items-center justify-center gap-2 rounded-full border border-clay/50 bg-white px-6 py-3 text-sm font-inter font-semibold text-dark transition-colors hover:bg-cream-100"
                        >
                            {copyState === "copied" ? (
                                <Check className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                            ) : (
                                <Copy className="h-4 w-4" aria-hidden="true" />
                            )}
                            {copyState === "copied" ? "Link copied" : "Copy link"}
                        </button>
                        <p
                            role="status"
                            aria-live="polite"
                            className="min-h-[1rem] text-center text-xs font-inter text-dark-muted"
                        >
                            {copyState === "copied"
                                ? "Link copied to clipboard."
                                : copyState === "failed"
                                  ? "Could not copy automatically. Please use the Join button."
                                  : ""}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <Link
                            ref={(node) => {
                                primaryActionRef.current = node;
                            }}
                            href={CONTACT_PAGE_HREF}
                            className="btn-primary flex w-full items-center justify-center !py-3.5 text-sm"
                        >
                            Contact support
                        </Link>
                        <a
                            href={INSTAGRAM_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex w-full items-center justify-center rounded-full border border-clay/50 bg-white px-6 py-3 text-sm font-inter font-semibold text-dark transition-colors hover:bg-cream-100"
                        >
                            Follow us on Instagram
                        </a>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
