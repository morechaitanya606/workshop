import type { User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import type { Tables, TablesInsert } from "@/lib/database.types";
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
export type AppUserRole = Tables<"profiles">["role"];
let skipRemoteAuthUntil = 0;

function getAuthRequestTimeoutMs() {
    const configuredTimeoutMs = Number.parseInt(process.env.SUPABASE_AUTH_TIMEOUT_MS || "", 10);
    return Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0
        ? configuredTimeoutMs
        : undefined;
}

function isDevAuthFallbackEnabled() {
    if (process.env.NODE_ENV === "production") {
        return false;
    }

    return process.env.ENABLE_DEV_AUTH_FALLBACK === "true";
}

function getBearerToken(request: NextRequest) {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return null;
    }
    return authHeader.slice("Bearer ".length).trim();
}

function getErrorMessage(error: unknown) {
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && "message" in error) {
        return String((error as { message?: unknown }).message || "");
    }
    return "";
}

function isTransientSupabaseAuthError(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    return (
        message.includes("fetch failed") ||
        message.includes("timeout") ||
        message.includes("network") ||
        message.includes("aborted") ||
        message.includes("und_err_connect_timeout")
    );
}

function decodeJwtPayload(token: string) {
    try {
        const parts = token.split(".");
        if (parts.length < 2) return null;
        const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const normalized = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
        const payload = JSON.parse(Buffer.from(normalized, "base64").toString("utf8")) as {
            sub?: unknown;
            email?: unknown;
            phone?: unknown;
            exp?: unknown;
            aud?: unknown;
            role?: unknown;
        };
        return payload;
    } catch {
        return null;
    }
}

function buildFallbackUserFromToken(token: string): User | null {
    const payload = decodeJwtPayload(token);
    if (!payload?.sub || typeof payload.sub !== "string") {
        return null;
    }

    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) {
        return null;
    }

    return {
        id: payload.sub,
        aud: typeof payload.aud === "string" ? payload.aud : "authenticated",
        role: typeof payload.role === "string" ? payload.role : "authenticated",
        email: typeof payload.email === "string" ? payload.email : null,
        phone: typeof payload.phone === "string" ? payload.phone : null,
        app_metadata: {},
        user_metadata: {},
    } as User;
}

export function jsonError(message: string, status = 400, details?: unknown) {
    if (status >= 500) {
        Sentry.captureMessage(message, {
            level: "error",
            extra: { details: details ?? null, status },
            tags: { layer: "api" },
        });
    }

    return NextResponse.json(
        {
            error: message,
            details: details ?? null,
        },
        { status }
    );
}

export async function requireAuthenticatedUser(request: NextRequest): Promise<AuthResult> {
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
            response: jsonError("Supabase public env vars are missing on the server.", 500),
        };
    }

    const isDevFallbackEnabled = isDevAuthFallbackEnabled();
    const shouldValidateRemoteInDev = process.env.SUPABASE_AUTH_REMOTE_VALIDATE === "true";
    const fallbackUser = buildFallbackUserFromToken(token);

    if (isDevFallbackEnabled && fallbackUser && !shouldValidateRemoteInDev) {
        return {
            ok: true,
            user: fallbackUser,
            accessToken: token,
        };
    }

    // When auth network is unstable in development, avoid repeating slow retries
    // for every API call and use JWT claims temporarily.
    if (isDevFallbackEnabled && fallbackUser && Date.now() < skipRemoteAuthUntil) {
        return {
            ok: true,
            user: fallbackUser,
            accessToken: token,
        };
    }

    try {
        const anonClient = createSupabaseAnonServerClient({
            requestTimeoutMs: getAuthRequestTimeoutMs(),
        });
        const { data, error } = await anonClient.auth.getUser(token);
        if (!error && data.user) {
            skipRemoteAuthUntil = 0;
            return {
                ok: true,
                user: data.user,
                accessToken: token,
            };
        }

        // Dev fallback: accept bearer tokens when Supabase auth endpoint is temporarily unreachable.
        // This avoids hard failures for local development workflows.
        if (isDevFallbackEnabled && isTransientSupabaseAuthError(error)) {
            skipRemoteAuthUntil = Date.now() + 60_000;
            if (fallbackUser) {
                return {
                    ok: true,
                    user: fallbackUser,
                    accessToken: token,
                };
            }
        }

        if (error || !data.user) {
            return {
                ok: false,
                response: jsonError("Invalid or expired auth token.", 401),
            };
        }
    } catch (error) {
        if (isDevFallbackEnabled && isTransientSupabaseAuthError(error)) {
            skipRemoteAuthUntil = Date.now() + 60_000;
            if (fallbackUser) {
                return {
                    ok: true,
                    user: fallbackUser,
                    accessToken: token,
                };
            }
        }
        if (isTransientSupabaseAuthError(error)) {
            return {
                ok: false,
                response: jsonError("Unable to validate auth token right now. Please retry.", 401),
            };
        }
        return {
            ok: false,
            response: jsonError("Unable to validate auth token.", 500, error),
        };
    }

    return {
        ok: false,
        response: jsonError("Invalid or expired auth token.", 401),
    };
}

export async function getUserRole(userId: string): Promise<AppUserRole> {
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
        const metadata = (user.user_metadata || {}) as Record<string, unknown>;
        const fullName =
            typeof metadata.full_name === "string" && metadata.full_name.trim()
                ? metadata.full_name.trim()
                : null;
        const avatarUrl =
            typeof metadata.avatar_url === "string" && metadata.avatar_url.trim()
                ? metadata.avatar_url.trim()
                : null;
        const dateOfBirth =
            typeof metadata.date_of_birth === "string" && metadata.date_of_birth.trim()
                ? metadata.date_of_birth.trim()
                : null;
        const phoneNumber =
            typeof metadata.phone_number === "string" && metadata.phone_number.trim()
                ? metadata.phone_number.trim()
                : typeof user.phone === "string" && user.phone.trim()
                  ? user.phone.trim()
                  : null;
        const profileSeed: TablesInsert<"profiles"> = {
            id: user.id,
        };

        if (fullName) {
            profileSeed.full_name = fullName;
        }
        if (avatarUrl) {
            profileSeed.avatar_url = avatarUrl;
        }
        if (dateOfBirth) {
            profileSeed.date_of_birth = dateOfBirth;
        }
        if (phoneNumber) {
            profileSeed.phone_number = phoneNumber;
        }

        const serviceClient = createSupabaseServiceClient();
        await serviceClient.from("profiles").upsert(profileSeed, { onConflict: "id" });
    } catch {
        // Non-blocking: profile table may not exist yet.
    }
}

export async function requireAdminUser(
    request: NextRequest
): Promise<(AuthSuccess & { role: AppUserRole }) | AuthFailure> {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth;
    }

    const role = await getUserRole(auth.user.id);
    if (role !== "admin") {
        return {
            ok: false,
            response: jsonError("Admin access is required for this action.", 403),
        };
    }

    return {
        ...auth,
        role,
    };
}

export async function requireHostUser(
    request: NextRequest
): Promise<(AuthSuccess & { role: AppUserRole }) | AuthFailure> {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth;
    }

    const role = await getUserRole(auth.user.id);
    if (role !== "host") {
        return {
            ok: false,
            response: jsonError("Host access is required for this action.", 403),
        };
    }

    return {
        ...auth,
        role,
    };
}

export async function requireHostOrAdmin(
    request: NextRequest
): Promise<(AuthSuccess & { role: AppUserRole }) | AuthFailure> {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth;
    }

    const role = await getUserRole(auth.user.id);
    if (role !== "host" && role !== "admin") {
        return {
            ok: false,
            response: jsonError("Host or Admin access is required for this action.", 403),
        };
    }

    return {
        ...auth,
        role,
    };
}
