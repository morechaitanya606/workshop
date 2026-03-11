import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedUser, jsonError, ensureUserProfile } from "@/lib/api-auth";
import { parseBody } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { profileUpdateSchema } from "@/lib/validators";

export async function GET(request: NextRequest) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        return NextResponse.json({
            profile: {
                fullName: auth.user.user_metadata?.full_name || null,
                avatarUrl: auth.user.user_metadata?.avatar_url || null,
            },
        });
    }

    try {
        await ensureUserProfile(auth.user);
        const { data, error } = await service.client
            .from("profiles")
            .select("full_name, avatar_url")
            .eq("id", auth.user.id)
            .maybeSingle();

        if (error) {
            return jsonError("Unable to load profile.", 500, error);
        }

        return NextResponse.json({
            profile: {
                fullName: data?.full_name || auth.user.user_metadata?.full_name || null,
                avatarUrl: data?.avatar_url || auth.user.user_metadata?.avatar_url || null,
            },
        });
    } catch (error) {
        return jsonError("Unable to load profile.", 500, String(error));
    }
}

export async function PATCH(request: NextRequest) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const parsed = await parseBody(
        request,
        profileUpdateSchema,
        "Invalid JSON payload.",
        "Invalid profile update payload."
    );
    if (!parsed.ok) {
        return parsed.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }

    const updates: { full_name?: string | null; avatar_url?: string | null } = {};
    if (typeof parsed.data.fullName === "string") {
        updates.full_name = parsed.data.fullName.trim();
    }
    if (typeof parsed.data.avatarUrl === "string") {
        updates.avatar_url = parsed.data.avatarUrl.trim() || null;
    }

    if (Object.keys(updates).length === 0) {
        return jsonError("No profile updates provided.", 400);
    }

    try {
        const { data, error } = await service.client
            .from("profiles")
            .upsert({ id: auth.user.id, ...updates }, { onConflict: "id" })
            .select("full_name, avatar_url")
            .maybeSingle();

        if (error) {
            return jsonError("Unable to update profile.", 500, error);
        }

        const mergedMetadata = {
            ...(auth.user.user_metadata || {}),
        } as Record<string, unknown>;
        if (updates.full_name !== undefined) {
            mergedMetadata.full_name = updates.full_name;
        }
        if (updates.avatar_url !== undefined) {
            mergedMetadata.avatar_url = updates.avatar_url;
        }

        const { error: authError } = await service.client.auth.admin.updateUserById(auth.user.id, {
            user_metadata: mergedMetadata,
        });
        if (authError) {
            return jsonError("Unable to update profile.", 500, authError);
        }

        return NextResponse.json({
            profile: {
                fullName: data?.full_name || updates.full_name || null,
                avatarUrl: data?.avatar_url || updates.avatar_url || null,
            },
        });
    } catch (error) {
        return jsonError("Unable to update profile.", 500, String(error));
    }
}
