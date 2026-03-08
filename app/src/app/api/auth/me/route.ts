import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ensureUserProfile, getUserRole, requireAuthenticatedUser } from "@/lib/api-auth";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const rateLimitResult = assertRateLimit({
        key: getRateLimitKey(request, "auth-me", auth.user.id),
        limit: 90,
        windowMs: 60_000,
        message: "Too many profile checks. Please wait a moment and retry.",
    });
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    await ensureUserProfile(auth.user);
    const role = await getUserRole(auth.user.id);

    return NextResponse.json({
        user: {
            id: auth.user.id,
            email: auth.user.email || null,
            fullName: auth.user.user_metadata?.full_name || null,
        },
        role,
    });
}
