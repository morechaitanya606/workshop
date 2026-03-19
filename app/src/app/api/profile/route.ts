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
    const userMetadata = (auth.user.user_metadata || {}) as Record<string, unknown>;
    const metadataDob =
        typeof userMetadata.date_of_birth === "string" ? userMetadata.date_of_birth : null;
    const metadataPhone =
        typeof userMetadata.phone_number === "string" ? userMetadata.phone_number : null;
    const fallbackPhone = auth.user.phone || null;

    const service = requireSupabaseService();
    if (!service.ok) {
        return NextResponse.json({
            profile: {
                fullName: auth.user.user_metadata?.full_name || null,
                avatarUrl: auth.user.user_metadata?.avatar_url || null,
                dateOfBirth: metadataDob,
                phoneNumber: metadataPhone || fallbackPhone,
            },
        });
    }

    try {
        await ensureUserProfile(auth.user);
        const { data, error } = await service.client
            .from("profiles")
            .select("full_name, avatar_url, date_of_birth, phone_number")
            .eq("id", auth.user.id)
            .maybeSingle();

        if (error) {
            return jsonError("Unable to load profile.", 500, error);
        }

        return NextResponse.json({
            profile: {
                fullName: data?.full_name || auth.user.user_metadata?.full_name || null,
                avatarUrl: data?.avatar_url || auth.user.user_metadata?.avatar_url || null,
                dateOfBirth: data?.date_of_birth || metadataDob || null,
                phoneNumber: data?.phone_number || metadataPhone || fallbackPhone || null,
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

    const updates: {
        full_name?: string | null;
        avatar_url?: string | null;
        date_of_birth?: string | null;
        phone_number?: string | null;
    } = {};
    const metadataUpdates: Record<string, unknown> = {};
    if (typeof parsed.data.fullName === "string") {
        updates.full_name = parsed.data.fullName.trim();
    }
    if (typeof parsed.data.avatarUrl === "string") {
        updates.avatar_url = parsed.data.avatarUrl.trim() || null;
    }
    if (typeof parsed.data.dateOfBirth === "string") {
        const trimmedDob = parsed.data.dateOfBirth.trim();
        updates.date_of_birth = trimmedDob || null;
        metadataUpdates.date_of_birth = trimmedDob || null;
    }
    if (typeof parsed.data.phoneNumber === "string") {
        const trimmedPhone = parsed.data.phoneNumber.trim();
        updates.phone_number = trimmedPhone || null;
        metadataUpdates.phone_number = trimmedPhone || null;
    }

    if (Object.keys(updates).length === 0 && Object.keys(metadataUpdates).length === 0) {
        return jsonError("No profile updates provided.", 400);
    }

    try {
        const profileData =
            Object.keys(updates).length > 0
                ? await service.client
                      .from("profiles")
                      .upsert({ id: auth.user.id, ...updates }, { onConflict: "id" })
                      .select("full_name, avatar_url, date_of_birth, phone_number")
                      .maybeSingle()
                : { data: null, error: null };

        if (profileData.error) {
            return jsonError("Unable to update profile.", 500, profileData.error);
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
        for (const [key, value] of Object.entries(metadataUpdates)) {
            mergedMetadata[key] = value;
        }

        const { error: authError } = await service.client.auth.admin.updateUserById(auth.user.id, {
            user_metadata: mergedMetadata,
        });
        if (authError) {
            return jsonError("Unable to update profile.", 500, authError);
        }

        return NextResponse.json({
            profile: {
                fullName:
                    profileData.data?.full_name ||
                    updates.full_name ||
                    auth.user.user_metadata?.full_name ||
                    null,
                avatarUrl:
                    profileData.data?.avatar_url ||
                    updates.avatar_url ||
                    auth.user.user_metadata?.avatar_url ||
                    null,
                dateOfBirth:
                    profileData.data?.date_of_birth ||
                    (typeof mergedMetadata.date_of_birth === "string"
                        ? mergedMetadata.date_of_birth
                        : null) ||
                    null,
                phoneNumber:
                    profileData.data?.phone_number ||
                    (typeof mergedMetadata.phone_number === "string"
                        ? mergedMetadata.phone_number
                        : null) ||
                    auth.user.phone ||
                    null,
            },
        });
    } catch (error) {
        return jsonError("Unable to update profile.", 500, String(error));
    }
}
