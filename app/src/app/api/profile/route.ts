import type { User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedUser, jsonError, ensureUserProfile } from "@/lib/api-auth";
import { parseBody } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { profileUpdateSchema } from "@/lib/validators";

type ProfilePayload = {
    fullName: string | null;
    avatarUrl: string | null;
    dateOfBirth: string | null;
    phoneNumber: string | null;
};

type ProfileRow = {
    full_name?: string | null;
    avatar_url?: string | null;
    date_of_birth?: string | null;
    phone_number?: string | null;
};

function getMetadataValue(metadata: Record<string, unknown>, key: string) {
    return typeof metadata[key] === "string" ? metadata[key] : null;
}

function getErrorMessage(error: unknown) {
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && "message" in error) {
        return String((error as { message?: unknown }).message || "");
    }
    return "";
}

function isRecoverableProfileSchemaError(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    const mentionsProfiles = message.includes("profiles");
    const mentionsSchemaDrift =
        message.includes("date_of_birth") ||
        message.includes("phone_number") ||
        message.includes("avatar_url") ||
        message.includes("full_name") ||
        message.includes("schema cache") ||
        (message.includes("column") && message.includes("does not exist")) ||
        (message.includes("relation") && message.includes("does not exist"));

    return mentionsProfiles && mentionsSchemaDrift;
}

function buildProfilePayload(
    user: User,
    overrides: Partial<ProfilePayload> = {},
    metadataOverride?: Record<string, unknown>
): ProfilePayload {
    const metadata = metadataOverride ?? ((user.user_metadata || {}) as Record<string, unknown>);
    const fallbackPhone = user.phone || null;

    return {
        fullName: overrides.fullName ?? getMetadataValue(metadata, "full_name"),
        avatarUrl: overrides.avatarUrl ?? getMetadataValue(metadata, "avatar_url"),
        dateOfBirth: overrides.dateOfBirth ?? getMetadataValue(metadata, "date_of_birth"),
        phoneNumber:
            overrides.phoneNumber ?? getMetadataValue(metadata, "phone_number") ?? fallbackPhone,
    };
}

export async function GET(request: NextRequest) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }
    const fallbackProfile = buildProfilePayload(auth.user);

    const service = requireSupabaseService();
    if (!service.ok) {
        return NextResponse.json({
            profile: fallbackProfile,
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
            if (isRecoverableProfileSchemaError(error)) {
                return NextResponse.json({ profile: fallbackProfile });
            }
            return jsonError("Unable to load profile.", 500, error);
        }

        return NextResponse.json({
            profile: buildProfilePayload(auth.user, {
                fullName: data?.full_name,
                avatarUrl: data?.avatar_url,
                dateOfBirth: data?.date_of_birth,
                phoneNumber: data?.phone_number,
            }),
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
        let profileData: ProfileRow | null = null;
        if (Object.keys(updates).length > 0) {
            const profileResult = await service.client
                .from("profiles")
                .upsert({ id: auth.user.id, ...updates }, { onConflict: "id" })
                .select("full_name, avatar_url, date_of_birth, phone_number")
                .maybeSingle();

            if (profileResult.error && !isRecoverableProfileSchemaError(profileResult.error)) {
                return jsonError("Unable to update profile.", 500, profileResult.error);
            }

            profileData = profileResult.data;
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
            profile: buildProfilePayload(
                auth.user,
                {
                    fullName: profileData?.full_name ?? updates.full_name,
                    avatarUrl: profileData?.avatar_url ?? updates.avatar_url,
                    dateOfBirth:
                        profileData?.date_of_birth ??
                        getMetadataValue(mergedMetadata, "date_of_birth"),
                    phoneNumber:
                        profileData?.phone_number ??
                        getMetadataValue(mergedMetadata, "phone_number"),
                },
                mergedMetadata
            ),
        });
    } catch (error) {
        return jsonError("Unable to update profile.", 500, String(error));
    }
}
