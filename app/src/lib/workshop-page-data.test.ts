import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
    isSupabaseServiceConfigured: true,
    createSupabaseServiceClient: vi.fn(),
    mapWorkshopRowToWorkshop: vi.fn(),
    queryMockWorkshops: vi.fn(),
    warnDevFallback: vi.fn(),
    captureException: vi.fn(),
    noStore: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@sentry/core", () => ({
    captureException: mockState.captureException,
}));

vi.mock("next/cache", () => ({
    unstable_noStore: mockState.noStore,
}));

vi.mock("@/lib/dev-warnings", () => ({
    warnDevFallback: mockState.warnDevFallback,
}));

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: mockState.createSupabaseServiceClient,
    get isSupabaseServiceConfigured() {
        return mockState.isSupabaseServiceConfigured;
    },
}));

vi.mock("@/lib/workshop-utils", () => ({
    mapWorkshopRowToWorkshop: mockState.mapWorkshopRowToWorkshop,
    queryMockWorkshops: mockState.queryMockWorkshops,
}));

import { loadExploreWorkshops, loadHomeWorkshops } from "@/lib/workshop-page-data";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const TEST_ENV = process.env as Record<string, string | undefined>;

function createHomeChain(result: Promise<unknown> | unknown, operator: "gte" | "lt") {
    const chain = {
        gte: vi.fn(),
        lt: vi.fn(),
        order: vi.fn(),
        limit: vi.fn(),
    };

    chain.gte.mockImplementation(() => chain);
    chain.lt.mockImplementation(() => chain);
    chain.order.mockImplementation(() => chain);
    chain.limit.mockImplementation(() => result);

    if (operator === "gte") {
        chain.lt.mockImplementation(() => chain);
    } else {
        chain.gte.mockImplementation(() => chain);
    }

    return chain;
}

function createExploreChain(result: Promise<unknown> | unknown) {
    const chain = {
        or: vi.fn(),
        eq: vi.fn(),
        lt: vi.fn(),
        gte: vi.fn(),
        lte: vi.fn(),
        order: vi.fn(),
        range: vi.fn(),
    };

    chain.or.mockImplementation(() => chain);
    chain.eq.mockImplementation(() => chain);
    chain.lt.mockImplementation(() => chain);
    chain.gte.mockImplementation(() => chain);
    chain.lte.mockImplementation(() => chain);
    chain.order.mockImplementation(() => chain);
    chain.range.mockImplementation(() => result);

    return chain;
}

describe("workshop-page-data", () => {
    beforeEach(() => {
        TEST_ENV.NODE_ENV = "development";
        mockState.isSupabaseServiceConfigured = true;
        mockState.createSupabaseServiceClient.mockReset();
        mockState.mapWorkshopRowToWorkshop.mockReset();
        mockState.queryMockWorkshops.mockReset();
        mockState.warnDevFallback.mockReset();
        mockState.captureException.mockReset();
        mockState.noStore.mockReset();

        mockState.mapWorkshopRowToWorkshop.mockImplementation((row) => ({
            id: row.id,
            title: row.title,
        }));
        mockState.queryMockWorkshops.mockReturnValue({
            data: [{ id: "mock-1", title: "Mock Workshop" }],
            total: 1,
            source: "mock",
        });
    });

    afterEach(() => {
        TEST_ENV.NODE_ENV = ORIGINAL_NODE_ENV;
    });

    it("returns Supabase workshops for the home page when the service is configured", async () => {
        const upcomingChain = createHomeChain(
            Promise.resolve({
                data: [{ id: "upcoming-1", title: "Upcoming Workshop" }],
                error: null,
            }),
            "gte"
        );
        const pastChain = createHomeChain(
            Promise.resolve({
                data: [{ id: "past-1", title: "Past Workshop" }],
                error: null,
            }),
            "lt"
        );

        mockState.createSupabaseServiceClient.mockReturnValue({
            from: vi
                .fn()
                .mockImplementationOnce(() => ({
                    select: vi.fn(() => upcomingChain),
                }))
                .mockImplementationOnce(() => ({
                    select: vi.fn(() => pastChain),
                })),
        });

        const result = await loadHomeWorkshops();

        expect(result).toEqual({
            data: [
                { id: "upcoming-1", title: "Upcoming Workshop" },
                { id: "past-1", title: "Past Workshop" },
            ],
            source: "supabase",
        });
        expect(mockState.warnDevFallback).not.toHaveBeenCalled();
    });

    it("falls back to mock home workshops in development when Supabase times out", async () => {
        const timeoutError = new Error("Supabase timeout");
        const upcomingChain = createHomeChain(Promise.reject(timeoutError), "gte");
        const pastChain = createHomeChain(
            Promise.resolve({
                data: [],
                error: null,
            }),
            "lt"
        );

        mockState.createSupabaseServiceClient.mockReturnValue({
            from: vi
                .fn()
                .mockImplementationOnce(() => ({
                    select: vi.fn(() => upcomingChain),
                }))
                .mockImplementationOnce(() => ({
                    select: vi.fn(() => pastChain),
                })),
        });

        const result = await loadHomeWorkshops();

        expect(result).toEqual({
            data: [{ id: "mock-1", title: "Mock Workshop" }],
            source: "mock",
        });
        expect(mockState.captureException).toHaveBeenCalledWith(
            timeoutError,
            expect.objectContaining({
                tags: expect.objectContaining({
                    route: "home_page",
                }),
            })
        );
        expect(mockState.warnDevFallback).toHaveBeenCalledWith(
            "home_page",
            expect.stringContaining("Supabase timeout")
        );
    });

    it("returns source error for the home page in production when loading fails", async () => {
        TEST_ENV.NODE_ENV = "production";
        const queryError = { message: "Database unavailable" };
        const upcomingChain = createHomeChain(
            Promise.resolve({
                data: null,
                error: queryError,
            }),
            "gte"
        );
        const pastChain = createHomeChain(
            Promise.resolve({
                data: null,
                error: null,
            }),
            "lt"
        );

        mockState.createSupabaseServiceClient.mockReturnValue({
            from: vi
                .fn()
                .mockImplementationOnce(() => ({
                    select: vi.fn(() => upcomingChain),
                }))
                .mockImplementationOnce(() => ({
                    select: vi.fn(() => pastChain),
                })),
        });

        const result = await loadHomeWorkshops();

        expect(result).toEqual({
            data: [],
            source: "error",
        });
        expect(mockState.noStore).toHaveBeenCalled();
        expect(mockState.warnDevFallback).not.toHaveBeenCalled();
    });

    it("returns Supabase workshops for the explore page when the service is configured", async () => {
        const exploreChain = createExploreChain(
            Promise.resolve({
                data: [{ id: "explore-1", title: "Explore Workshop" }],
                error: null,
                count: 1,
            })
        );

        mockState.createSupabaseServiceClient.mockReturnValue({
            from: vi.fn(() => ({
                select: vi.fn(() => exploreChain),
            })),
        });

        const result = await loadExploreWorkshops({
            q: "pottery",
            page: "1",
            pageSize: "8",
        });

        expect(result).toEqual({
            data: [{ id: "explore-1", title: "Explore Workshop" }],
            total: 1,
            source: "supabase",
        });
        expect(mockState.warnDevFallback).not.toHaveBeenCalled();
    });

    it("falls back to mock explore workshops in development when Supabase times out", async () => {
        const timeoutError = new Error("Explore timeout");
        const exploreChain = createExploreChain(Promise.reject(timeoutError));

        mockState.createSupabaseServiceClient.mockReturnValue({
            from: vi.fn(() => ({
                select: vi.fn(() => exploreChain),
            })),
        });

        const result = await loadExploreWorkshops({
            category: "Pottery",
            page: "1",
            pageSize: "8",
        });

        expect(result).toMatchObject({
            data: [{ id: "mock-1", title: "Mock Workshop" }],
            total: 1,
            source: "mock",
        });
        expect(mockState.captureException).toHaveBeenCalledWith(
            timeoutError,
            expect.objectContaining({
                tags: expect.objectContaining({
                    route: "explore_page",
                }),
            })
        );
        expect(mockState.warnDevFallback).toHaveBeenCalledWith(
            "explore_page",
            expect.stringContaining("Explore timeout")
        );
    });

    it("returns source error for the explore page in production when loading fails", async () => {
        TEST_ENV.NODE_ENV = "production";
        const queryError = { message: "Explore database unavailable" };
        const exploreChain = createExploreChain(
            Promise.resolve({
                data: null,
                error: queryError,
                count: null,
            })
        );

        mockState.createSupabaseServiceClient.mockReturnValue({
            from: vi.fn(() => ({
                select: vi.fn(() => exploreChain),
            })),
        });

        const result = await loadExploreWorkshops({
            page: "1",
            pageSize: "8",
        });

        expect(result).toEqual({
            data: [],
            total: 0,
            source: "error",
        });
        expect(mockState.noStore).toHaveBeenCalled();
        expect(mockState.warnDevFallback).not.toHaveBeenCalled();
    });
});
