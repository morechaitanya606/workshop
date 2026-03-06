import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
    ensureUserProfile,
    getUserRole,
    requireAuthenticatedUser,
} from "@/lib/api-auth";

export async function GET(request: NextRequest) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
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
