"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicOffer } from "@/lib/offers";
import { codeNeedsRecheck, type AppliedCode } from "./workshop-pricing";

/** POST /api/coupons/validate gets this long before the visitor is told to try again. */
export const CODE_CHECK_TIMEOUT_MS = 15_000;
/** A hidden code is checked again this long after the guest count stops changing. */
export const CODE_RECHECK_DELAY_MS = 600;
/** Same limit as the validate route's request schema. */
const CODE_MAX_LENGTH = 64;

export const CODE_SIGN_IN_MESSAGE = "Log in to apply this code. We will keep it for you.";
const CODE_NETWORK_MESSAGE =
    "Could not check the code. You seem to be offline or on a slow connection. Please try again.";

export type CodeCheckResult =
    | { ok: true; code: AppliedCode }
    | {
          ok: false;
          reason: "sign_in" | "rejected" | "rate_limited" | "server" | "network";
          message: string;
      };

/** Upper-case code as checkout reads it, or null when it cannot be a code. */
export function normalizeCode(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const code = raw.trim().toUpperCase();
    if (!code || code.length > CODE_MAX_LENGTH || /[\s\u0000-\u001f\u007f]/.test(code)) {
        return null;
    }
    return code;
}

/**
 * Reads ?coupon= from the address bar and removes it from the address, so the code does not stay
 * in the history, in a copied or shared link, in the Referer of a third-party request or in an
 * error report. Null when there is no usable code. Never throws.
 */
export function takeCouponFromUrl(win: Window = window): string | null {
    let url: URL;
    try {
        url = new URL(win.location.href);
    } catch {
        return null;
    }
    if (!url.searchParams.has("coupon")) return null;
    const code = normalizeCode(url.searchParams.get("coupon"));
    url.searchParams.delete("coupon");
    try {
        // null state: Next.js keeps its own history state and syncs the new address (App Router).
        win.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
        // The code still applies; it only stays in the address bar.
    }
    return code;
}

/**
 * Asks the server whether a code applies to this booking. The route is signed-in only and rate
 * limited, and answers one vague message for unknown codes; the price itself is always computed
 * here with pricing.ts from the coupon it returns. Never throws.
 */
export async function checkWorkshopCode(input: {
    code: string;
    workshopId: string;
    guests: number;
    /** Subtotal after Early Bird: the minimum order is measured on it. */
    subtotal: number;
    accessToken: string;
    timeoutMs?: number;
}): Promise<CodeCheckResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? CODE_CHECK_TIMEOUT_MS);
    try {
        const response = await fetch("/api/coupons/validate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${input.accessToken}`,
            },
            body: JSON.stringify({
                code: input.code,
                workshopId: input.workshopId,
                subtotal: input.subtotal,
                guests: input.guests,
            }),
            signal: controller.signal,
        });
        const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        const discountValue = Number(data?.discount);
        if (
            response.ok &&
            data?.valid === true &&
            typeof data.id === "string" &&
            data.id &&
            (data.type === "percentage" || data.type === "fixed") &&
            Number.isFinite(discountValue)
        ) {
            return {
                ok: true,
                code: {
                    code: input.code,
                    couponId: data.id,
                    discountType: data.type,
                    discountValue,
                    guests: input.guests,
                },
            };
        }
        if (response.status === 401) {
            return { ok: false, reason: "sign_in", message: CODE_SIGN_IN_MESSAGE };
        }
        if (response.status === 429) {
            return {
                ok: false,
                reason: "rate_limited",
                message: "Too many tries. Please wait a minute and try again.",
            };
        }
        if (response.status >= 500) {
            return {
                ok: false,
                reason: "server",
                message: "Could not check the code right now. Please try again.",
            };
        }
        const message = typeof data?.message === "string" ? data.message.trim() : "";
        return {
            ok: false,
            reason: "rejected",
            message: message || "This coupon code is not valid for this order.",
        };
    } catch {
        return { ok: false, reason: "network", message: CODE_NETWORK_MESSAGE };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * The visitor's coupon code on the workshop page: apply (server check), remove, and a new check
 * of a hidden code when the guest count changes (a code of a public offer carries its own rules,
 * so pricing.ts re-judges it without a request). A signed-out visitor's code is kept as
 * `pendingCode` so the login link can carry it back.
 */
export function useWorkshopCode(options: {
    workshopId: string;
    accessToken: string | null;
    isSignedIn: boolean;
    guests: number;
    /** Current subtotal after Early Bird (sent with every check). */
    subtotal: number;
    /** The workshop's public offers: a code of one of them needs no new check. */
    offers: ReadonlyArray<PublicOffer>;
}) {
    const { workshopId, accessToken, isSignedIn, guests, subtotal, offers } = options;
    const [applied, setApplied] = useState<AppliedCode | null>(null);
    const [applyingCode, setApplyingCode] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pendingCode, setPendingCode] = useState<string | null>(null);
    /** The code to put back in the input after a failed check, so one tap retries it. */
    const [retryCode, setRetryCode] = useState<string | null>(null);
    const requestRef = useRef(0);
    const latest = useRef({ guests, subtotal });
    latest.current = { guests, subtotal };

    useEffect(() => {
        return () => {
            // Late answers after unmount are ignored.
            requestRef.current += 1;
        };
    }, []);

    const apply = useCallback(
        async (rawCode: string) => {
            const code = normalizeCode(rawCode);
            if (!code) return false;
            setError(null);
            setRetryCode(null);
            if (!isSignedIn) {
                setPendingCode(code);
                setError(CODE_SIGN_IN_MESSAGE);
                return false;
            }
            if (!accessToken) {
                setPendingCode(code);
                setError("Your session expired. Please log in again to apply this code.");
                return false;
            }
            // Signed in: nothing waits for a login any more (a code taken from the address is
            // remembered before the session is known, see `remember`).
            setPendingCode(null);
            const requestId = ++requestRef.current;
            setApplyingCode(code);
            const result = await checkWorkshopCode({
                code,
                workshopId,
                guests: latest.current.guests,
                subtotal: latest.current.subtotal,
                accessToken,
            });
            if (requestId !== requestRef.current) return false;
            setApplyingCode(null);
            if (result.ok) {
                setApplied(result.code);
                setPendingCode(null);
                return true;
            }
            if (result.reason === "sign_in") setPendingCode(code);
            setRetryCode(code);
            setError(result.message);
            return false;
        },
        [accessToken, isSignedIn, workshopId]
    );

    const remove = useCallback(() => {
        requestRef.current += 1;
        setApplied(null);
        setApplyingCode(null);
        setError(null);
        setPendingCode(null);
        setRetryCode(null);
    }, []);

    const needsRecheck = codeNeedsRecheck(applied, offers, guests);
    useEffect(() => {
        if (!applied || !needsRecheck) return;
        if (!accessToken) {
            setApplied(null);
            setRetryCode(applied.code);
            setError("Your session expired. Please log in again to apply this code.");
            return;
        }
        const code = applied.code;
        const timer = setTimeout(() => {
            const requestId = ++requestRef.current;
            void checkWorkshopCode({
                code,
                workshopId,
                guests: latest.current.guests,
                subtotal: latest.current.subtotal,
                accessToken,
            }).then((result) => {
                if (requestId !== requestRef.current) return;
                if (result.ok) {
                    setApplied(result.code);
                    return;
                }
                setApplied(null);
                setRetryCode(code);
                setError(
                    result.reason === "rejected"
                        ? `${result.message} Your code ${code} was removed.`
                        : result.message
                );
            });
        }, CODE_RECHECK_DELAY_MS);
        return () => clearTimeout(timer);
    }, [accessToken, applied, guests, needsRecheck, workshopId]);

    return {
        applied,
        applyingCode,
        error,
        pendingCode,
        retryCode,
        apply,
        remove,
        /** Remember a code (e.g. from ?coupon=) without checking it yet. */
        remember: setPendingCode,
    };
}
