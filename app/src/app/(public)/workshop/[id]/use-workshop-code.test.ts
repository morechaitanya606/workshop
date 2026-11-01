import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicOffer } from "@/lib/offers";
import {
    CODE_RECHECK_DELAY_MS,
    CODE_SIGN_IN_MESSAGE,
    checkWorkshopCode,
    normalizeCode,
    takeCouponFromUrl,
    useWorkshopCode,
} from "./use-workshop-code";

const fetchMock = vi.fn();

function reply(status: number, body: unknown) {
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const accepted = (id: string, type: "percentage" | "fixed", discount: number) =>
    reply(200, { valid: true, id, type, discount, message: "Coupon applied successfully!" });

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
});

describe("normalizeCode", () => {
    it("trims and upper-cases, and refuses what cannot be a code", () => {
        expect(normalizeCode("  save300 ")).toBe("SAVE300");
        expect(normalizeCode("")).toBeNull();
        expect(normalizeCode("two words")).toBeNull();
        expect(normalizeCode("a".repeat(65))).toBeNull();
        expect(normalizeCode(42)).toBeNull();
        expect(normalizeCode(null)).toBeNull();
    });
});

describe("takeCouponFromUrl", () => {
    it("returns the code and takes it out of the address, keeping the rest", () => {
        window.history.replaceState(
            null,
            "",
            "/workshop/pottery-1?coupon=save300&utm_source=wa#details"
        );
        expect(takeCouponFromUrl()).toBe("SAVE300");
        expect(window.location.pathname).toBe("/workshop/pottery-1");
        expect(window.location.search).toBe("?utm_source=wa");
        expect(window.location.hash).toBe("#details");
    });

    it("leaves an address without a code alone", () => {
        window.history.replaceState(null, "", "/workshop/pottery-1?utm_source=wa");
        const replace = vi.spyOn(window.history, "replaceState");
        try {
            expect(takeCouponFromUrl()).toBeNull();
            expect(replace).not.toHaveBeenCalled();
        } finally {
            replace.mockRestore();
        }
        expect(window.location.search).toBe("?utm_source=wa");
    });

    it("takes an unusable code out of the address too", () => {
        window.history.replaceState(null, "", "/workshop/pottery-1?coupon=not%20a%20code");
        expect(takeCouponFromUrl()).toBeNull();
        expect(window.location.search).toBe("");
    });

    it("still returns the code when the address cannot be rewritten", () => {
        window.history.replaceState(null, "", "/workshop/pottery-1?coupon=save300");
        const replace = vi.spyOn(window.history, "replaceState").mockImplementation(() => {
            throw new Error("SecurityError");
        });
        try {
            expect(takeCouponFromUrl()).toBe("SAVE300");
        } finally {
            replace.mockRestore();
        }
    });
});

describe("checkWorkshopCode", () => {
    const input = {
        code: "SAVE300",
        workshopId: "w1",
        guests: 2,
        subtotal: 3599,
        accessToken: "tok",
    };

    it("asks the server with the booking and returns the coupon it accepted", async () => {
        fetchMock.mockResolvedValue(accepted("c-1", "fixed", 300));
        await expect(checkWorkshopCode(input)).resolves.toEqual({
            ok: true,
            code: {
                code: "SAVE300",
                couponId: "c-1",
                discountType: "fixed",
                discountValue: 300,
                guests: 2,
            },
        });
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/coupons/validate");
        expect(init.headers.Authorization).toBe("Bearer tok");
        expect(JSON.parse(init.body)).toEqual({
            code: "SAVE300",
            workshopId: "w1",
            subtotal: 3599,
            guests: 2,
        });
    });

    it("does not trust an answer that is not a complete coupon", async () => {
        fetchMock.mockResolvedValue(reply(200, { valid: true, type: "fixed", discount: 300 }));
        await expect(checkWorkshopCode(input)).resolves.toMatchObject({
            ok: false,
            reason: "rejected",
        });
    });

    it("tells the visitor why a check failed", async () => {
        fetchMock.mockResolvedValueOnce(reply(401, {}));
        await expect(checkWorkshopCode(input)).resolves.toMatchObject({
            ok: false,
            reason: "sign_in",
            message: CODE_SIGN_IN_MESSAGE,
        });
        fetchMock.mockResolvedValueOnce(reply(429, {}));
        await expect(checkWorkshopCode(input)).resolves.toMatchObject({
            ok: false,
            reason: "rate_limited",
        });
        fetchMock.mockResolvedValueOnce(reply(503, {}));
        await expect(checkWorkshopCode(input)).resolves.toMatchObject({
            ok: false,
            reason: "server",
        });
        fetchMock.mockResolvedValueOnce(
            reply(400, { valid: false, message: "Valid for 3 or more seats." })
        );
        await expect(checkWorkshopCode(input)).resolves.toEqual({
            ok: false,
            reason: "rejected",
            message: "Valid for 3 or more seats.",
        });
        fetchMock.mockResolvedValueOnce(reply(400, { valid: false }));
        await expect(checkWorkshopCode(input)).resolves.toMatchObject({
            ok: false,
            reason: "rejected",
            message: "This coupon code is not valid for this order.",
        });
    });

    it("never throws: offline is a network answer", async () => {
        fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
        await expect(checkWorkshopCode(input)).resolves.toMatchObject({
            ok: false,
            reason: "network",
        });
    });

    it("gives up on a hung connection after the timeout", async () => {
        vi.useFakeTimers();
        fetchMock.mockImplementation(
            (_url: string, init: { signal: AbortSignal }) =>
                new Promise((_resolve, reject) => {
                    init.signal.addEventListener("abort", () =>
                        reject(new DOMException("Aborted", "AbortError"))
                    );
                })
        );
        const pending = checkWorkshopCode({ ...input, timeoutMs: 50 });
        await vi.advanceTimersByTimeAsync(60);
        await expect(pending).resolves.toMatchObject({ ok: false, reason: "network" });
    });
});

const listedOffer: PublicOffer = {
    id: "00000000-0000-4000-8000-000000000003",
    kind: "listed",
    label: "₹300 off per booking",
    discountType: "fixed",
    discountValue: 300,
    minGuests: null,
    minOrderAmount: null,
    startsAt: null,
    availableUntil: null,
    endsAt: null,
    code: "SAVE300",
    workshopIds: null,
    categories: null,
};

type HookProps = { guests: number; accessToken: string | null; isSignedIn: boolean };

function renderCode(initial: Partial<HookProps> = {}, offers: PublicOffer[] = []) {
    return renderHook(
        (props: HookProps) =>
            useWorkshopCode({
                workshopId: "w1",
                subtotal: 3599,
                offers,
                ...props,
            }),
        { initialProps: { guests: 2, accessToken: "tok", isSignedIn: true, ...initial } }
    );
}

describe("useWorkshopCode", () => {
    it("signed out: keeps the code for the login link and asks nothing", async () => {
        const { result } = renderCode({ accessToken: null, isSignedIn: false });
        let applied: boolean | undefined;
        await act(async () => {
            applied = await result.current.apply("save300");
        });
        expect(applied).toBe(false);
        expect(result.current.pendingCode).toBe("SAVE300");
        expect(result.current.error).toBe(CODE_SIGN_IN_MESSAGE);
        expect(result.current.applied).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("signed in: a valid code is applied for the guest count it was checked for", async () => {
        fetchMock.mockResolvedValue(accepted("c-hidden", "percentage", 15));
        const { result } = renderCode();
        await act(async () => {
            await result.current.apply(" hidden15 ");
        });
        expect(result.current.applied).toEqual({
            code: "HIDDEN15",
            couponId: "c-hidden",
            discountType: "percentage",
            discountValue: 15,
            guests: 2,
        });
        expect(result.current.applyingCode).toBeNull();
        expect(result.current.error).toBeNull();
    });

    it("a refused code is not applied and goes back to the field for one-tap retry", async () => {
        fetchMock.mockResolvedValue(
            reply(400, { valid: false, message: "Valid for 3 or more seats." })
        );
        const { result } = renderCode();
        await act(async () => {
            await result.current.apply("group3");
        });
        expect(result.current.applied).toBeNull();
        expect(result.current.retryCode).toBe("GROUP3");
        expect(result.current.error).toBe("Valid for 3 or more seats.");
    });

    it("signed in: a code remembered before the session was known stops waiting for a login", async () => {
        fetchMock.mockResolvedValue(
            reply(400, { valid: false, message: "Valid for 3 or more seats." })
        );
        const { result } = renderCode();
        act(() => result.current.remember("GROUP3"));
        expect(result.current.pendingCode).toBe("GROUP3");
        await act(async () => {
            await result.current.apply("group3");
        });
        // A refusal for a signed-in visitor must not offer them a login link.
        expect(result.current.pendingCode).toBeNull();
        expect(result.current.error).toBe("Valid for 3 or more seats.");
    });

    it("remove clears the code, the error and the retry", async () => {
        fetchMock.mockResolvedValue(accepted("c-hidden", "percentage", 15));
        const { result } = renderCode();
        await act(async () => {
            await result.current.apply("hidden15");
        });
        act(() => result.current.remove());
        expect(result.current.applied).toBeNull();
        expect(result.current.error).toBeNull();
        expect(result.current.retryCode).toBeNull();
    });

    it("checks a hidden code again for a new guest count, after the count settles", async () => {
        vi.useFakeTimers();
        fetchMock.mockResolvedValue(accepted("c-hidden", "percentage", 15));
        const { result, rerender } = renderCode();
        await act(async () => {
            await result.current.apply("hidden15");
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);

        rerender({ guests: 3, accessToken: "tok", isSignedIn: true });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(CODE_RECHECK_DELAY_MS + 10);
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(JSON.parse(fetchMock.mock.calls[1][1].body).guests).toBe(3);
        expect(result.current.applied?.guests).toBe(3);
    });

    it("removes a hidden code the server no longer accepts for the new guest count", async () => {
        vi.useFakeTimers();
        fetchMock
            .mockResolvedValueOnce(accepted("c-hidden", "percentage", 15))
            .mockResolvedValueOnce(reply(400, { valid: false, message: "Valid for 5+ seats." }));
        const { result, rerender } = renderCode();
        await act(async () => {
            await result.current.apply("hidden15");
        });
        rerender({ guests: 3, accessToken: "tok", isSignedIn: true });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(CODE_RECHECK_DELAY_MS + 10);
        });
        expect(result.current.applied).toBeNull();
        expect(result.current.retryCode).toBe("HIDDEN15");
        expect(result.current.error).toBe("Valid for 5+ seats. Your code HIDDEN15 was removed.");
    });

    it("needs no new check for the code of a public offer: the page knows its rules", async () => {
        vi.useFakeTimers();
        fetchMock.mockResolvedValue(accepted(listedOffer.id, "fixed", 300));
        const { result, rerender } = renderCode({}, [listedOffer]);
        await act(async () => {
            await result.current.apply("save300");
        });
        rerender({ guests: 4, accessToken: "tok", isSignedIn: true });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(CODE_RECHECK_DELAY_MS * 3);
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(result.current.applied?.code).toBe("SAVE300");
    });
});
