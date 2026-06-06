import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { parseBody } from "@/lib/api-route";
import { requireAuthenticatedUser, jsonError } from "@/lib/api-auth";
import type { Tables } from "@/lib/database.types";
import { requireSupabaseService } from "@/lib/api-helpers";
import { workshopNotificationSchema } from "@/lib/validators";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";

type NotificationRow = {
    notify_similar: Tables<"workshop_notification_preferences">["notify_similar"] | null;
    notify_creator: Tables<"workshop_notification_preferences">["notify_creator"] | null;
};

function mapNotificationState(record: NotificationRow | null | undefined) {
    return {
        similar: Boolean(record?.notify_similar),
        creator: Boolean(record?.notify_creator),
    };
}

function isMissingNotificationPreferencesTableError(error: unknown) {
    if (!error || typeof error !== "object") {
        return false;
    }

    const code = String((error as { code?: string }).code || "").toUpperCase();
    const message = String((error as { message?: string }).message || "").toLowerCase();

    return (
        code === "42P01" ||
        code === "PGRST205" ||
        message.includes("public.workshop_notification_preferences") ||
        message.includes("workshop_notification_preferences")
    );
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    const { id: workshopId } = await params;

    try {
        const { data, error } = await serviceClient
            .from("workshop_notification_preferences")
            .select("notify_similar, notify_creator")
            .eq("user_id", auth.user.id)
            .eq("workshop_id", workshopId)
            .maybeSingle();

        if (isMissingNotificationPreferencesTableError(error)) {
            return jsonError(
                "Notification preferences table is unavailable. Run the latest Supabase migration first.",
                503,
                error
            );
        }

        if (error) {
            return jsonError("Unable to load notification preferences.", 500, error);
        }

        return NextResponse.json({
            subscriptions: mapNotificationState(data as NotificationRow | null),
        });
    } catch (error) {
        return jsonError("Unable to load notification preferences.", 500, String(error));
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const rateLimitResult = await assertRateLimit({
        key: getRateLimitKey(request, "workshop-notifications-write", auth.user.id),
        limit: 20,
        windowMs: 60_000,
        message: "Too many notification updates. Please wait and try again.",
    });
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    const parsed = await parseBody(
        request,
        workshopNotificationSchema,
        "Invalid JSON payload.",
        "Invalid notification request."
    );
    if (!parsed.ok) {
        return parsed.response;
    }

    const { id: workshopId } = await params;

    try {
        const { data: existing, error: existingError } = await serviceClient
            .from("workshop_notification_preferences")
            .select("notify_similar, notify_creator")
            .eq("user_id", auth.user.id)
            .eq("workshop_id", workshopId)
            .maybeSingle();

        if (isMissingNotificationPreferencesTableError(existingError)) {
            return jsonError(
                "Notification preferences table is unavailable. Run the latest Supabase migration first.",
                503,
                existingError
            );
        }

        if (existingError) {
            return jsonError("Unable to load existing preferences.", 500, existingError);
        }

        const nextState = {
            notify_similar:
                parsed.data.mode === "similar"
                    ? true
                    : Boolean((existing as NotificationRow | null)?.notify_similar),
            notify_creator:
                parsed.data.mode === "creator"
                    ? true
                    : Boolean((existing as NotificationRow | null)?.notify_creator),
        };

        const { data: saved, error: saveError } = await serviceClient
            .from("workshop_notification_preferences")
            .upsert(
                {
                    user_id: auth.user.id,
                    workshop_id: workshopId,
                    ...nextState,
                },
                { onConflict: "user_id,workshop_id" }
            )
            .select("notify_similar, notify_creator")
            .single();

        if (isMissingNotificationPreferencesTableError(saveError)) {
            return jsonError(
                "Notification preferences table is unavailable. Run the latest Supabase migration first.",
                503,
                saveError
            );
        }

        if (saveError) {
            return jsonError("Unable to save notification preference.", 500, saveError);
        }

        return NextResponse.json({
            subscriptions: mapNotificationState(saved as NotificationRow),
            message:
                parsed.data.mode === "similar"
                    ? "Notification enabled for similar events."
                    : "Notification enabled for creator's next event.",
        });
    } catch (error) {
        return jsonError("Unable to save notification preference.", 500, String(error));
    }
}
