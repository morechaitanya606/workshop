import type { User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
    createSupabaseAnonServerClient,
    createSupabaseServiceClient,
    isSupabasePublicConfigured,
    isSupabaseServiceConfigured,
} from "@/lib/supabase-server";

type AuthSuccess = {
    ok: true;
    user: User;
    accessToken: string;
};

type AuthFailure = {
    ok: false;
    response: NextResponse;
};

export type AuthResult = AuthSuccess | AuthFailure;

function getBearerToken(request: NextRequest) {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return null;
    }
    return authHeader.slice("Bearer ".length).trim();
}

export function jsonError(message: string, status = 400, details?: unknown) {
    return NextResponse.json(
        {
            error: message,
            details: details ?? null,
        },
        { status }
    );
}

export async function requireAuthenticatedUser(
    request: NextRequest
): Promise<AuthResult> {
    const token = getBearerToken(request);
    if (!token) {
        return {
            ok: false,
            response: jsonError("Missing Authorization Bearer token.", 401),
        };
    }

    if (!isSupabasePublicConfigured) {
        return {
            ok: false,
            response: jsonError(
                "Supabase public env vars are missing on the server.",
                500
            ),
        };
    }

    try {
        const anonClient = createSupabaseAnonServerClient();
        const { data, error } = await anonClient.auth.getUser(token);
        if (error || !data.user) {
            return {
                ok: false,
                response: jsonError("Invalid or expired auth token.", 401),
            };
        }

        return {
            ok: true,
            user: data.user,
            accessToken: token,
        };
    } catch (error) {
        return {
            ok: false,
            response: jsonError("Unable to validate auth token.", 500, error),
        };
    }
}

export async function getUserRole(userId: string) {
    if (!isSupabaseServiceConfigured) {
        return "user";
    }

    try {
        const serviceClient = createSupabaseServiceClient();
        const { data, error } = await serviceClient
            .from("profiles")
            .select("role")
            .eq("id", userId)
            .maybeSingle();

        if (error) {
            return "user";
        }

        return data?.role || "user";
    } catch {
        return "user";
    }
}

export async function ensureUserProfile(user: User) {
    if (!isSupabaseServiceConfigured) return;

    try {
        const serviceClient = createSupabaseServiceClient();
        await serviceClient.from("profiles").upsert(
            {
                id: user.id,
                full_name: user.user_metadata?.full_name || null,
            },
            { onConflict: "id" }
        );
    } catch {
        // Non-blocking: profile table may not exist yet.
    }
}

export async function requireAdminUser(
    request: NextRequest
): Promise<(AuthSuccess & { role: string }) | AuthFailure> {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth;
    }

    const role = await getUserRole(auth.user.id);
    if (role !== "admin") {
        return {
            ok: false,
            response: jsonError(
                "Admin access is required for this action.",
                403
            ),
        };
    }

    return {
        ...auth,
        role,
    };
}
