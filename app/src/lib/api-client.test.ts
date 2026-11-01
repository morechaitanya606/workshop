import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    CONFIRM_ATTEMPT_TIMEOUT_MS,
    HOLD_REQUEST_TIMEOUT_MS,
    ORDER_REQUEST_TIMEOUT_MS,
    WORKSHOP_LOAD_TIMEOUT_MS,
} from "@/app/(private)/booking/booking-network";
import {
    API_AUTH_TIMEOUT_MS,
    API_GET_TIMEOUT_MS,
    API_MEDIA_WRITE_TIMEOUT_MS,
    API_OFFLINE_MESSAGE,
    API_WRITE_TIMEOUT_MS,
    API_WRITE_UNCONFIRMED_MESSAGE,
    apiRequest,
    approveAdminWorkshop,
    askChatbot,
    confirmCheckoutPayment,
    createAdminCommunityPhoto,
    createAdminFaq,
    createAdminWorkshop,
    createBookingHold,
    createCheckoutOrder,
    createCommunity,
    createHostWorkshop,
    getAdminWorkshopBookingStatus,
    getAdminWorkshops,
    getAuthMe,
    getWorkshopById,
    isApiClientError,
    setAdminWorkshopBookingsClosed,
    submitWorkshopFeedback,
    toApiErrorMessage,
    updateAdminCommunityPhoto,
    updateAdminWorkshop,
    updateHostWorkshop,
    updatePlatformSettings,
    updateProfile,
    ApiClientError,
} from "@/lib/api-client";
import { getCommunitiesSetupIncompleteMessage } from "@/lib/community-api-errors";

type FetchInit = RequestInit & { signal?: AbortSignal };

function jsonResponse(body: unknown, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => (body === undefined ? "" : JSON.stringify(body)),
    } as unknown as Response;
}

function htmlResponse(status: number) {
    return {
        ok: false,
        status,
        text: async () => "<html>Bad gateway</html>",
    } as unknown as Response;
}

/** A fetch that never answers, and rejects like the browser when its signal aborts. */
function hangingFetch(_input: unknown, init?: FetchInit) {
    return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
        });
    });
}

async function captureError(promise: Promise<unknown>): Promise<ApiClientError> {
    try {
        await promise;
    } catch (error) {
        if (isApiClientError(error)) return error;
        throw error;
    }
    throw new Error("Expected the request to fail.");
}

/** Tracks whether `promise` has settled, for "still waiting" checks between timer ticks. */
function watch(promise: Promise<unknown>) {
    const watcher = { settled: false };
    promise.then(
        () => {
            watcher.settled = true;
        },
        () => {
            watcher.settled = true;
        }
    );
    return watcher;
}

const API_ROUTES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "app", "api");

type ServerRoute = {
    /** The URL path, with every [param] segment filled in. */
    path: string;
    /** `export const maxDuration` of the route file, in ms; null when it declares none. */
    maxDurationMs: number | null;
    methods: Array<"POST" | "PATCH" | "DELETE">;
    copiesImages: boolean;
};

/** Reads what each route file promises (maxDuration, verbs), so a new route cannot be missed. */
function readServerRoutes(directory: string): ServerRoute[] {
    const routes: ServerRoute[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = join(directory, entry.name);
        if (entry.isDirectory()) {
            routes.push(...readServerRoutes(full));
        } else if (entry.name === "route.ts") {
            const source = readFileSync(full, "utf8");
            const duration = /export const maxDuration\s*=\s*(\d+)/.exec(source);
            const segments = relative(API_ROUTES_DIR, directory)
                .split(sep)
                .map((segment) => (/^\[.+\]$/.test(segment) ? "x1" : segment));
            routes.push({
                path: `/api/${segments.join("/")}`,
                maxDurationMs: duration ? Number(duration[1]) * 1000 : null,
                methods: [
                    ...source.matchAll(
                        /export\s+(?:async\s+function|const)\s+(POST|PATCH|DELETE)\b/g
                    ),
                ].map((match) => match[1] as "POST" | "PATCH" | "DELETE"),
                copiesImages: /from\s+["']@\/lib\/image-mirror["']/.test(source),
            });
        }
    }
    return routes;
}

const chatPayload = { message: "hi", stage: "idle" as const };
const checkoutPayload = {
    holdId: "h1",
    workshopId: "w1",
    firstName: "Asha",
    lastName: "Rao",
    email: "asha@example.com",
};

describe("apiRequest", () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("returns the JSON body of a successful request", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ workshop: { id: "w1" } }));

        await expect(getWorkshopById("w1")).resolves.toEqual({ workshop: { id: "w1" } });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const init = fetchMock.mock.calls[0][1] as FetchInit;
        expect(init.method).toBe("GET");
        expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it("keeps the HTTP error shape: status, body error as message, details", async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({ error: "Workshop not found.", details: { code: "NOT_FOUND" } }, 404)
        );

        const error = await captureError(getWorkshopById("missing"));
        expect(error.status).toBe(404);
        expect(error.message).toBe("Workshop not found.");
        expect(error.details).toEqual({ code: "NOT_FOUND" });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("uses the whole body as details when there is no details field (409 codes)", async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({ code: "BOOKINGS_CLOSED", message: "Bookings are closed." }, 409)
        );

        const error = await captureError(askChatbot(chatPayload));
        expect(error.status).toBe(409);
        expect(error.message).toBe("Request failed.");
        expect(error.details).toEqual({ code: "BOOKINGS_CLOSED", message: "Bookings are closed." });
    });

    it("treats a non-JSON error body as empty", async () => {
        fetchMock.mockResolvedValueOnce(htmlResponse(500));

        const error = await captureError(askChatbot(chatPayload));
        expect(error.status).toBe(500);
        expect(error.message).toBe("Request failed.");
        expect(error.details).toEqual({});
    });

    it("turns a dropped connection into a status-0 error with the offline message", async () => {
        fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
        vi.useFakeTimers();

        const pending = captureError(getWorkshopById("w1"));
        await vi.runAllTimersAsync();
        const error = await pending;

        expect(error.status).toBe(0);
        expect(error.message).toBe(API_OFFLINE_MESSAGE);
        expect(error.details).toEqual({ code: "NETWORK_ERROR", reason: "offline" });
        expect(toApiErrorMessage(error, "Fallback")).toBe(API_OFFLINE_MESSAGE);
        // GET: one retry after the first failure.
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("retries a GET once after a network error and returns the second answer", async () => {
        fetchMock
            .mockRejectedValueOnce(new TypeError("Failed to fetch"))
            .mockResolvedValueOnce(jsonResponse({ workshop: { id: "w1" } }));
        vi.useFakeTimers();

        const pending = getWorkshopById("w1");
        await vi.runAllTimersAsync();

        await expect(pending).resolves.toEqual({ workshop: { id: "w1" } });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("retries a GET once on 502/503/504, then reports the HTTP error", async () => {
        fetchMock
            .mockResolvedValueOnce(htmlResponse(503))
            .mockResolvedValueOnce(jsonResponse({ error: "Still down." }, 504));
        vi.useFakeTimers();

        const pending = captureError(getWorkshopById("w1"));
        await vi.runAllTimersAsync();
        const error = await pending;

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(error.status).toBe(504);
        expect(error.message).toBe("Still down.");
    });

    it("does not retry a GET on other HTTP errors", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Boom" }, 500));

        const error = await captureError(getWorkshopById("w1"));
        expect(error.status).toBe(500);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("times out a GET after about 15 s per attempt", async () => {
        fetchMock.mockImplementation(hangingFetch);
        vi.useFakeTimers();

        const pending = captureError(getWorkshopById("w1"));
        await vi.advanceTimersByTimeAsync(API_GET_TIMEOUT_MS - 1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await vi.runAllTimersAsync();
        const error = await pending;

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(error.status).toBe(0);
        expect(error.message).toBe(API_OFFLINE_MESSAGE);
        expect(error.details).toEqual({ code: "NETWORK_ERROR", reason: "timeout" });
    });

    it("never retries a POST, on a network error", async () => {
        fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
        vi.useFakeTimers();

        const pending = captureError(askChatbot(chatPayload));
        await vi.runAllTimersAsync();
        const error = await pending;

        expect(error.status).toBe(0);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("never retries a POST, on a 503", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ error: "Unavailable" }, 503));
        vi.useFakeTimers();

        const pending = captureError(askChatbot(chatPayload));
        await vi.runAllTimersAsync();
        const error = await pending;

        expect(error.status).toBe(503);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("times out a POST after about 25 s, without a retry", async () => {
        fetchMock.mockImplementation(hangingFetch);
        vi.useFakeTimers();

        const pending = captureError(askChatbot(chatPayload));
        await vi.advanceTimersByTimeAsync(API_GET_TIMEOUT_MS + 1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(API_WRITE_TIMEOUT_MS - API_GET_TIMEOUT_MS);
        const error = await pending;

        expect(error.status).toBe(0);
        expect(error.details).toEqual({ code: "NETWORK_ERROR", reason: "timeout" });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("honours a caller's timeoutMs", async () => {
        fetchMock.mockImplementation(hangingFetch);
        vi.useFakeTimers();

        const pending = captureError(
            apiRequest("/api/x", { method: "POST", body: {}, timeoutMs: 1_000 })
        );
        await vi.advanceTimersByTimeAsync(1_000);
        const error = await pending;

        expect(error.status).toBe(0);
        expect(error.details).toEqual({ code: "NETWORK_ERROR", reason: "timeout" });
    });

    it("stops at once, without a retry, when the caller's signal aborts", async () => {
        fetchMock.mockImplementation(hangingFetch);
        const controller = new AbortController();

        const pending = captureError(apiRequest("/api/x", { signal: controller.signal }));
        controller.abort();
        const error = await pending;

        expect(error.status).toBe(0);
        expect(error.message).toBe(API_OFFLINE_MESSAGE);
        expect(error.details).toEqual({ code: "NETWORK_ERROR", reason: "aborted" });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not call fetch with an already aborted signal", async () => {
        const controller = new AbortController();
        controller.abort();

        const error = await captureError(apiRequest("/api/x", { signal: controller.signal }));
        expect(error.status).toBe(0);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("tells a failed write it may have been saved, not just to try again", async () => {
        fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

        const error = await captureError(createAdminFaq("token", { question: "Q", answer: "A" }));

        expect(error.status).toBe(0);
        expect(error.message).toBe(API_WRITE_UNCONFIRMED_MESSAGE);
        expect(error.message).not.toBe(API_OFFLINE_MESSAGE);
        expect(error.details).toEqual({ code: "NETWORK_ERROR", reason: "offline" });
        expect(toApiErrorMessage(error, "Fallback")).toBe(API_WRITE_UNCONFIRMED_MESSAGE);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("gives a write that timed out the same message", async () => {
        fetchMock.mockImplementation(hangingFetch);
        vi.useFakeTimers();

        const pending = captureError(createAdminFaq("token", { question: "Q", answer: "A" }));
        await vi.advanceTimersByTimeAsync(API_WRITE_TIMEOUT_MS);
        const error = await pending;

        expect(error.message).toBe(API_WRITE_UNCONFIRMED_MESSAGE);
        expect(error.details).toEqual({ code: "NETWORK_ERROR", reason: "timeout" });
    });

    it("keeps the plain message for a write the caller cancelled", async () => {
        fetchMock.mockImplementation(hangingFetch);
        const controller = new AbortController();

        const pending = captureError(
            apiRequest("/api/x", { method: "POST", body: {}, signal: controller.signal })
        );
        controller.abort();
        const error = await pending;

        expect(error.message).toBe(API_OFFLINE_MESSAGE);
        expect(error.details).toEqual({ code: "NETWORK_ERROR", reason: "aborted" });
    });

    it.each(["PATCH", "DELETE"] as const)(
        "never retries a %s after a network error",
        async (method) => {
            fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
            vi.useFakeTimers();

            const pending = captureError(apiRequest("/api/x", { method }));
            await vi.runAllTimersAsync();
            const error = await pending;

            expect(error.status).toBe(0);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        }
    );

    it.each(["PATCH", "DELETE"] as const)("never retries a %s after a timeout", async (method) => {
        fetchMock.mockImplementation(hangingFetch);
        vi.useFakeTimers();

        const pending = captureError(apiRequest("/api/x", { method }));
        await vi.runAllTimersAsync();
        const error = await pending;

        expect(error.details).toEqual({ code: "NETWORK_ERROR", reason: "timeout" });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    describe("write timeouts", () => {
        // Endpoints whose server copies pasted image links into storage (maxDuration = 60).
        const mediaWrites: Array<[string, () => Promise<unknown>]> = [
            ["createAdminWorkshop", () => createAdminWorkshop("token", {} as never)],
            ["updateAdminWorkshop", () => updateAdminWorkshop("token", "w1", {} as never)],
            ["createHostWorkshop", () => createHostWorkshop("token", {} as never)],
            ["updateHostWorkshop", () => updateHostWorkshop("token", "w1", {} as never)],
            [
                "createAdminCommunityPhoto",
                () => createAdminCommunityPhoto("token", { imageUrl: "https://example.com/a.jpg" }),
            ],
            [
                "updateAdminCommunityPhoto",
                () => updateAdminCommunityPhoto("token", "p1", { altText: "A photo" }),
            ],
            [
                "submitWorkshopFeedback",
                () => submitWorkshopFeedback("w1", "token", { comment: "Lovely" }),
            ],
            ["updateProfile", () => updateProfile("token", { fullName: "Asha Rao" })],
            ["updatePlatformSettings", () => updatePlatformSettings("token", { settings: {} })],
            ["createCommunity", () => createCommunity({} as never)],
        ];

        it.each(mediaWrites)("%s waits for the server's image copying", async (_name, call) => {
            fetchMock.mockImplementation(hangingFetch);
            vi.useFakeTimers();

            const pending = captureError(call());
            const watcher = watch(pending);
            await vi.advanceTimersByTimeAsync(API_WRITE_TIMEOUT_MS + 1_000);
            expect(watcher.settled).toBe(false);
            await vi.advanceTimersByTimeAsync(
                API_MEDIA_WRITE_TIMEOUT_MS - API_WRITE_TIMEOUT_MS - 1_001
            );
            expect(watcher.settled).toBe(false);
            await vi.advanceTimersByTimeAsync(1);
            const error = await pending;

            expect(error.details).toEqual({ code: "NETWORK_ERROR", reason: "timeout" });
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it("does not report a slow but successful image-copying save as a failure", async () => {
            fetchMock.mockImplementation(
                (_input: unknown, init?: FetchInit) =>
                    new Promise<Response>((resolve, reject) => {
                        const timer = setTimeout(
                            () => resolve(jsonResponse({ workshop: { id: "w1" } })),
                            40_000
                        );
                        init?.signal?.addEventListener("abort", () => {
                            clearTimeout(timer);
                            reject(new DOMException("The operation was aborted.", "AbortError"));
                        });
                    })
            );
            vi.useFakeTimers();

            const pending = updateAdminWorkshop("token", "w1", {} as never);
            await vi.advanceTimersByTimeAsync(40_000);

            await expect(pending).resolves.toEqual({ workshop: { id: "w1" } });
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        // The booking page, the switch and the chat nest under 25 s; admin/workshops/<id>/... is
        // not an image-copying route even though it shares the prefix.
        const ordinaryWrites: Array<[string, () => Promise<unknown>]> = [
            [
                "setAdminWorkshopBookingsClosed",
                () => setAdminWorkshopBookingsClosed("token", "w1", true),
            ],
            ["approveAdminWorkshop", () => approveAdminWorkshop("token", "w1")],
            [
                "createBookingHold",
                () => createBookingHold("token", { workshopId: "w1", guests: 2 }),
            ],
            ["createCheckoutOrder", () => createCheckoutOrder("token", checkoutPayload)],
            [
                "confirmCheckoutPayment",
                () =>
                    confirmCheckoutPayment("token", {
                        ...checkoutPayload,
                        razorpayOrderId: "order_1",
                        razorpayPaymentId: "pay_1",
                        razorpaySignature: "sig",
                    }),
            ],
            ["askChatbot", () => askChatbot(chatPayload)],
        ];

        it.each(ordinaryWrites)("%s keeps the 25 s limit", async (_name, call) => {
            fetchMock.mockImplementation(hangingFetch);
            vi.useFakeTimers();

            const pending = captureError(call());
            const watcher = watch(pending);
            await vi.advanceTimersByTimeAsync(API_WRITE_TIMEOUT_MS - 1);
            expect(watcher.settled).toBe(false);
            await vi.advanceTimersByTimeAsync(1);
            const error = await pending;

            expect(error.details).toEqual({ code: "NETWORK_ERROR", reason: "timeout" });
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it("lets a caller's timeoutMs beat the path default", async () => {
            fetchMock.mockImplementation(hangingFetch);
            vi.useFakeTimers();

            const pending = captureError(
                apiRequest("/api/admin/workshops", {
                    method: "POST",
                    body: {},
                    timeoutMs: API_WRITE_TIMEOUT_MS,
                })
            );
            const watcher = watch(pending);
            await vi.advanceTimersByTimeAsync(API_WRITE_TIMEOUT_MS - 1);
            expect(watcher.settled).toBe(false);
            // The watcher does see a timeout that comes early (the image-copying tests rely on it).
            await vi.advanceTimersByTimeAsync(1);
            expect(watcher.settled).toBe(true);
            const error = await pending;

            expect(error.details).toEqual({ code: "NETWORK_ERROR", reason: "timeout" });
        });

        it("keeps the 15 s read limit for a GET on an image-copying path", async () => {
            fetchMock.mockImplementation(hangingFetch);
            vi.useFakeTimers();

            const pending = captureError(getAdminWorkshops("token"));
            await vi.advanceTimersByTimeAsync(API_GET_TIMEOUT_MS + 1_000);
            // The first attempt gave up at 15 s and the retry has started.
            expect(fetchMock).toHaveBeenCalledTimes(2);
            await vi.runAllTimersAsync();
            const error = await pending;

            expect(error.message).toBe(API_OFFLINE_MESSAGE);
            expect(error.details).toEqual({ code: "NETWORK_ERROR", reason: "timeout" });
        });

        it("gives the role check 30 s per attempt", async () => {
            fetchMock.mockImplementation(hangingFetch);
            vi.useFakeTimers();

            const pending = captureError(getAuthMe("token"));
            await vi.advanceTimersByTimeAsync(API_AUTH_TIMEOUT_MS - 1);
            expect(fetchMock).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(1_100);
            expect(fetchMock).toHaveBeenCalledTimes(2);
            await vi.runAllTimersAsync();
            const error = await pending;

            expect(error.details).toEqual({ code: "NETWORK_ERROR", reason: "timeout" });
        });

        it("keeps its timeouts under the booking page's own backstops", () => {
            // Two GET attempts and a retry pause of at most 1 s.
            expect(2 * API_GET_TIMEOUT_MS + 1_000).toBeLessThan(WORKSHOP_LOAD_TIMEOUT_MS);
            expect(API_WRITE_TIMEOUT_MS).toBeLessThan(HOLD_REQUEST_TIMEOUT_MS);
            expect(API_WRITE_TIMEOUT_MS).toBeLessThan(ORDER_REQUEST_TIMEOUT_MS);
            expect(API_WRITE_TIMEOUT_MS).toBeLessThan(CONFIRM_ATTEMPT_TIMEOUT_MS);
        });
    });

    describe("server maxDuration", () => {
        // The route files are the source of truth. A route that declares a long maxDuration needs
        // a client limit above it: otherwise its caller is told "offline" while the server still
        // saves, and the person's retry saves a second row.
        const serverRoutes = readServerRoutes(API_ROUTES_DIR);
        const longServerWrites = serverRoutes.flatMap((route) =>
            route.maxDurationMs === null
                ? []
                : route.methods.map((method) => ({
                      label: `${method} ${route.path}`,
                      path: route.path,
                      method,
                      maxDurationMs: route.maxDurationMs as number,
                  }))
        );

        it("finds the routes that declare a maxDuration", () => {
            expect(longServerWrites.length).toBeGreaterThanOrEqual(8);
        });

        it("has a maxDuration on every route that copies pasted image links", () => {
            const copying = serverRoutes.filter((route) => route.copiesImages);
            expect(copying.length).toBeGreaterThanOrEqual(8);
            expect(
                copying.filter((route) => route.maxDurationMs === null).map((route) => route.path)
            ).toEqual([]);
        });

        it.each(longServerWrites)(
            "$label waits past the server's maxDuration",
            async ({ path, method, maxDurationMs }) => {
                fetchMock.mockImplementation(hangingFetch);
                vi.useFakeTimers();

                const pending = captureError(apiRequest(path, { method, body: {} }));
                const watcher = watch(pending);
                await vi.advanceTimersByTimeAsync(maxDurationMs);
                expect(watcher.settled).toBe(false);
                await vi.runAllTimersAsync();
                const error = await pending;

                expect(error.details).toEqual({ code: "NETWORK_ERROR", reason: "timeout" });
                expect(fetchMock).toHaveBeenCalledTimes(1);
            }
        );
    });

    describe("Bookings switch requests", () => {
        const status = { workshopId: "w1", closed: true, closedWorkshopIds: ["w1"] };
        const readFailed = {
            error: "Could not read the bookings status right now. Try again.",
            code: "READ_FAILED",
        };

        it("reads the status with an uncached GET to the encoded path", async () => {
            fetchMock.mockResolvedValueOnce(jsonResponse(status));

            await expect(getAdminWorkshopBookingStatus("token", "yoga/pune 1")).resolves.toEqual(
                status
            );

            const [path, init] = fetchMock.mock.calls[0] as [string, FetchInit];
            expect(path).toBe("/api/admin/workshops/yoga%2Fpune%201/booking-status");
            expect(init.method).toBe("GET");
            expect(init.cache).toBe("no-store");
            expect(init.headers).toEqual({ Authorization: "Bearer token" });
            expect(init.body).toBeUndefined();
        });

        it.each([true, false])(
            "sends { closed: %s } as a POST to the same path",
            async (closed) => {
                fetchMock.mockResolvedValueOnce(jsonResponse({ ...status, closed }));

                await expect(
                    setAdminWorkshopBookingsClosed("token", "w1", closed)
                ).resolves.toEqual({ ...status, closed });

                const [path, init] = fetchMock.mock.calls[0] as [string, FetchInit];
                expect(path).toBe("/api/admin/workshops/w1/booking-status");
                expect(init.method).toBe("POST");
                expect(init.headers).toEqual({
                    "Content-Type": "application/json",
                    Authorization: "Bearer token",
                });
                expect(JSON.parse(String(init.body))).toEqual({ closed });
            }
        );

        it("keeps the READ_FAILED code of a 503 and never retries the write", async () => {
            fetchMock.mockResolvedValue(jsonResponse(readFailed, 503));

            const error = await captureError(setAdminWorkshopBookingsClosed("token", "w1", true));

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(error.status).toBe(503);
            expect(error.details).toEqual(readFailed);
            // A 5xx is shown as the caller's own "nothing was changed" text.
            expect(toApiErrorMessage(error, "Nothing was changed.")).toBe("Nothing was changed.");
        });

        it("retries the status read once on a 503, then reports its code", async () => {
            fetchMock.mockResolvedValue(jsonResponse(readFailed, 503));
            vi.useFakeTimers();

            const pending = captureError(getAdminWorkshopBookingStatus("token", "w1"));
            await vi.runAllTimersAsync();
            const error = await pending;

            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(error.status).toBe(503);
            expect(error.details).toEqual(readFailed);
        });

        it("reports a save that timed out as status 0, which the switch re-checks", async () => {
            fetchMock.mockImplementation(hangingFetch);
            vi.useFakeTimers();

            const pending = captureError(setAdminWorkshopBookingsClosed("token", "w1", true));
            await vi.advanceTimersByTimeAsync(API_WRITE_TIMEOUT_MS);
            const error = await pending;

            expect(isApiClientError(error)).toBe(true);
            expect(error.status).toBe(0);
            expect(error.message).toBe(API_WRITE_UNCONFIRMED_MESSAGE);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });
    });

    describe("access tokens", () => {
        const token = "tok_secret_9f8e7d6c5b4a";

        it("travel only in the Authorization header", async () => {
            fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

            await apiRequest("/api/x?a=1", { method: "POST", accessToken: token, body: { a: 1 } });

            const [url, init] = fetchMock.mock.calls[0] as [string, FetchInit];
            expect(url).not.toContain(token);
            expect(String(init.body)).not.toContain(token);
            expect(init.headers).toMatchObject({ Authorization: `Bearer ${token}` });
        });

        it.each(["GET", "POST"] as const)(
            "stay out of the error of a %s that lost its connection",
            async (method) => {
                // Whatever the browser put in its own error text is never passed on.
                fetchMock.mockRejectedValue(new TypeError(`Failed to fetch (Bearer ${token})`));
                vi.useFakeTimers();

                const pending = captureError(apiRequest("/api/x", { method, accessToken: token }));
                await vi.runAllTimersAsync();
                const error = await pending;

                expect(`${error.message} ${JSON.stringify(error.details)}`).not.toContain(token);
            }
        );

        it("stay out of the error of a request that timed out", async () => {
            fetchMock.mockImplementation(hangingFetch);
            vi.useFakeTimers();

            const pending = captureError(
                apiRequest("/api/x", { method: "POST", accessToken: token, body: {} })
            );
            await vi.runAllTimersAsync();
            const error = await pending;

            expect(`${error.message} ${JSON.stringify(error.details)}`).not.toContain(token);
        });

        it("stay out of the error of an HTTP failure", async () => {
            fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Not allowed." }, 403));

            const error = await captureError(apiRequest("/api/x", { accessToken: token }));

            expect(error.message).toBe("Not allowed.");
            expect(`${error.message} ${JSON.stringify(error.details)}`).not.toContain(token);
        });
    });

    describe("GET retry pause", () => {
        it("ends without a third request when the caller aborts during the retry", async () => {
            fetchMock
                .mockRejectedValueOnce(new TypeError("Failed to fetch"))
                .mockImplementationOnce(hangingFetch);
            vi.useFakeTimers();
            const controller = new AbortController();

            const pending = captureError(apiRequest("/api/x", { signal: controller.signal }));
            await vi.advanceTimersByTimeAsync(1_000);
            expect(fetchMock).toHaveBeenCalledTimes(2);
            controller.abort();
            const error = await pending;

            expect(error.details).toEqual({ code: "NETWORK_ERROR", reason: "aborted" });
            await vi.runAllTimersAsync();
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it.each([
            { random: 0, pause: 600 },
            { random: 0.999, pause: 999 },
        ])("is 600-999 ms (random $random -> $pause ms)", async ({ random, pause }) => {
            vi.spyOn(Math, "random").mockReturnValue(random);
            fetchMock
                .mockRejectedValueOnce(new TypeError("Failed to fetch"))
                .mockResolvedValueOnce(jsonResponse({ ok: true }));
            vi.useFakeTimers();

            const pending = apiRequest("/api/x");
            await vi.advanceTimersByTimeAsync(0);
            await vi.advanceTimersByTimeAsync(pause - 1);
            expect(fetchMock).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(1);
            expect(fetchMock).toHaveBeenCalledTimes(2);

            await expect(pending).resolves.toEqual({ ok: true });
        });

        it("ends without a second request when the caller aborts during the pause", async () => {
            fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
            vi.useFakeTimers();
            const controller = new AbortController();

            const pending = captureError(apiRequest("/api/x", { signal: controller.signal }));
            await vi.advanceTimersByTimeAsync(100);
            expect(fetchMock).toHaveBeenCalledTimes(1);
            controller.abort();
            const error = await pending;

            expect(error.status).toBe(0);
            expect(error.details).toEqual({ code: "NETWORK_ERROR", reason: "aborted" });
            await vi.runAllTimersAsync();
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });
    });

    it("times out when the body stalls after the headers arrived", async () => {
        fetchMock.mockImplementation(async (_input: unknown, init?: FetchInit) => ({
            ok: true,
            status: 200,
            text: () =>
                new Promise<string>((_, reject) => {
                    init?.signal?.addEventListener("abort", () => {
                        reject(new DOMException("The operation was aborted.", "AbortError"));
                    });
                }),
        }));
        vi.useFakeTimers();

        const pending = captureError(askChatbot(chatPayload));
        await vi.runAllTimersAsync();
        const error = await pending;

        expect(error.status).toBe(0);
        expect(error.details).toEqual({ code: "NETWORK_ERROR", reason: "timeout" });
    });
});

describe("isApiClientError and toApiErrorMessage", () => {
    it("recognises an ApiClientError, status 0 included, and nothing else", () => {
        expect(isApiClientError(new ApiClientError("Offline", 0))).toBe(true);
        expect(isApiClientError(new ApiClientError("Nope", 404))).toBe(true);
        expect(isApiClientError(new TypeError("Failed to fetch"))).toBe(false);
        expect(isApiClientError({ status: 0, message: "Offline" })).toBe(false);
        expect(isApiClientError(null)).toBe(false);
    });

    it("keeps the shape callers read: an Error with name, status and details", () => {
        const plain = new ApiClientError("Nope", 404);
        expect(plain).toBeInstanceOf(Error);
        expect(plain.name).toBe("ApiClientError");
        expect(plain.status).toBe(404);
        expect(plain.details).toBeNull();

        const detailed = new ApiClientError("Closed", 409, { code: "BOOKINGS_CLOSED" });
        expect(detailed.details).toEqual({ code: "BOOKINGS_CLOSED" });
    });

    const networkFailure = new ApiClientError(API_OFFLINE_MESSAGE, 0, {
        code: "NETWORK_ERROR",
        reason: "offline",
    });
    const setupIncomplete = getCommunitiesSetupIncompleteMessage();

    it.each([
        {
            name: "shows a 4xx in the server's words",
            error: new ApiClientError("Workshop not found.", 404),
            expected: "Workshop not found.",
        },
        {
            name: "hides a 5xx behind the caller's fallback",
            error: new ApiClientError("relation x does not exist", 500),
            expected: "Fallback",
        },
        {
            name: "hides a 503 that carries a code behind the fallback too",
            error: new ApiClientError("Try again.", 503, { code: "READ_FAILED" }),
            expected: "Fallback",
        },
        {
            name: "keeps the message of a network failure",
            error: networkFailure,
            expected: API_OFFLINE_MESSAGE,
        },
        {
            name: "lets the communities setup message through a 5xx",
            error: new ApiClientError(setupIncomplete, 500),
            expected: setupIncomplete,
        },
        {
            name: "falls back when a 4xx has no message",
            error: new ApiClientError("", 400),
            expected: "Fallback",
        },
        {
            name: "falls back for a plain Error",
            error: new Error("raw internal text"),
            expected: "Fallback",
        },
        {
            name: "falls back for a value that is not an error",
            error: "boom",
            expected: "Fallback",
        },
    ])("$name", ({ error, expected }) => {
        expect(toApiErrorMessage(error, "Fallback")).toBe(expected);
    });
});
