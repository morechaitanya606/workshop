import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH } from "./route";
import { ensureUserProfile, requireAuthenticatedUser } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { parseBody } from "@/lib/api-route";

vi.mock("@/lib/api-auth", () => ({
    ensureUserProfile: vi.fn(),
    requireAuthenticatedUser: vi.fn(),
    jsonError: vi.fn((message: string, status = 400, details?: unknown) =>
        NextResponse.json(
            {
                error: message,
                details: details ?? null,
            },
            { status }
        )
    ),
}));

vi.mock("@/lib/api-helpers", () => ({
    requireSupabaseService: vi.fn(),
}));

vi.mock("@/lib/api-route", () => ({
    parseBody: vi.fn(),
}));

function createProfileSelectBuilder(result: unknown) {
    const builder = {
        eq: vi.fn(),
        maybeSingle: vi.fn(),
    };

    builder.eq.mockImplementation(() => builder);
    builder.maybeSingle.mockResolvedValue(result);

    return builder;
}

function createProfileUpsertBuilder(result: unknown) {
    const builder = {
        select: vi.fn(),
    };
    const selectBuilder = {
        maybeSingle: vi.fn(),
    };

    builder.select.mockReturnValue(selectBuilder);
    selectBuilder.maybeSingle.mockResolvedValue(result);

    return builder;
}

describe("/api/profile route", () => {
    const authUser = {
        id: "user-1",
        phone: "8888888888",
        user_metadata: {
            full_name: "Chait",
            avatar_url: "/images/me.webp",
            date_of_birth: "1994-05-06",
            phone_number: "9999999999",
        },
    } as any;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAuthenticatedUser).mockResolvedValue({
            ok: true,
            user: authUser,
            accessToken: "token",
        });
        vi.mocked(ensureUserProfile).mockResolvedValue(undefined);
    });

    it("falls back to auth metadata when the profile schema is missing a newer column", async () => {
        const profileBuilder = createProfileSelectBuilder({
            data: null,
            error: {
                message:
                    "Could not find the 'date_of_birth' column of 'profiles' in the schema cache",
            },
        });
        const serviceClient = {
            from: vi.fn(() => ({
                select: vi.fn(() => profileBuilder),
            })),
        };

        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as any,
        });

        const response = await GET(new NextRequest("http://localhost/api/profile"));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({
            profile: {
                fullName: "Chait",
                avatarUrl: "/images/me.webp",
                dateOfBirth: "1994-05-06",
                phoneNumber: "9999999999",
            },
        });
    });

    it("updates auth metadata even when the profiles table is behind the API schema", async () => {
        const upsertBuilder = createProfileUpsertBuilder({
            data: null,
            error: {
                message: 'column "phone_number" of relation "profiles" does not exist',
            },
        });
        const updateUserById = vi.fn().mockResolvedValue({ error: null });
        const serviceClient = {
            from: vi.fn(() => ({
                upsert: vi.fn(() => upsertBuilder),
            })),
            auth: {
                admin: {
                    updateUserById,
                },
            },
        };

        vi.mocked(parseBody).mockResolvedValue({
            ok: true,
            data: {
                fullName: "Updated Chait",
                avatarUrl: "/uploads/avatar.webp",
                dateOfBirth: "1995-06-07",
                phoneNumber: "7777777777",
            },
        } as any);
        vi.mocked(requireSupabaseService).mockReturnValue({
            ok: true,
            client: serviceClient as any,
        });

        const response = await PATCH(
            new NextRequest("http://localhost/api/profile", {
                method: "PATCH",
                body: JSON.stringify({ fullName: "Updated Chait" }),
            })
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(updateUserById).toHaveBeenCalledWith("user-1", {
            user_metadata: {
                full_name: "Updated Chait",
                avatar_url: "/uploads/avatar.webp",
                date_of_birth: "1995-06-07",
                phone_number: "7777777777",
            },
        });
        expect(body).toEqual({
            profile: {
                fullName: "Updated Chait",
                avatarUrl: "/uploads/avatar.webp",
                dateOfBirth: "1995-06-07",
                phoneNumber: "7777777777",
            },
        });
    });
});
