import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { parseBody } from "@/lib/api-route";
import { requireAuthenticatedUser, jsonError } from "@/lib/api-auth";
import type { Tables } from "@/lib/database.types";
import { requireSupabaseService } from "@/lib/api-helpers";
import { workshopNotificationSchema } from "@/lib/validators";
import { ensureWorkshopSeededFromMock } from "@/lib/workshop-utils";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";

type NotificationRow = {
    notify_similar: Tables<"workshop_notification_preferences">["notify_similar"] | null;
    notify_creator: Tables<"workshop_notification_preferences">["notify_creator"] | null;
};

const fallbackNotificationStore = new Map<string, { similar: boolean; creator: boolean }>();

function mapNotificationState(record: NotificationRow | null | undefined) {
    return {
        similar: Boolean(record?.notify_similar),
        creator: Boolean(record?.notify_creator),
    };
}

function notificationFallbackKey(userId: string, workshopId: string) {
    return `${userId}:${workshopId}`;
}

function getFallbackNotificationState(userId: string, workshopId: string) {
    return (
        fallbackNotificationStore.get(notificationFallbackKey(userId, workshopId)) || {
            similar: false,
            creator: false,
        }
    );
}

function upsertFallbackNotificationState(
    userId: string,
    workshopId: string,
    mode: "similar" | "creator"
) {
    const current = getFallbackNotificationState(userId, workshopId);
    const next = {
        similar: mode === "similar" ? true : current.similar,
        creator: mode === "creator" ? true : current.creator,
    };
    fallbackNotificationStore.set(notificationFallbackKey(userId, workshopId), next);
    return next;
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

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    const workshopId = params.id;

    try {
        const seeded = await ensureWorkshopSeededFromMock(serviceClient, workshopId);
        if (!seeded) {
            return jsonError("Workshop not found.", 404);
        }

        const { data, error } = await serviceClient
            .from("workshop_notification_preferences")
            .select("notify_similar, notify_creator")
            .eq("user_id", auth.user.id)
            .eq("workshop_id", workshopId)
            .maybeSingle();

        if (isMissingNotificationPreferencesTableError(error)) {
            return NextResponse.json({
                subscriptions: getFallbackNotificationState(auth.user.id, workshopId),
            });
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

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
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

    const workshopId = params.id;

    try {
        const seeded = await ensureWorkshopSeededFromMock(serviceClient, workshopId);
        if (!seeded) {
            return jsonError("Workshop not found.", 404);
        }

        const { data: existing, error: existingError } = await serviceClient
            .from("workshop_notification_preferences")
            .select("notify_similar, notify_creator")
            .eq("user_id", auth.user.id)
            .eq("workshop_id", workshopId)
            .maybeSingle();

        if (isMissingNotificationPreferencesTableError(existingError)) {
            const subscriptions = upsertFallbackNotificationState(
                auth.user.id,
                workshopId,
                parsed.data.mode
            );

            return NextResponse.json({
                subscriptions,
                message:
                    parsed.data.mode === "similar"
                        ? "Notification enabled for similar events."
                        : "Notification enabled for creator's next event.",
            });
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
            const subscriptions = upsertFallbackNotificationState(
                auth.user.id,
                workshopId,
                parsed.data.mode
            );

            return NextResponse.json({
                subscriptions,
                message:
                    parsed.data.mode === "similar"
                        ? "Notification enabled for similar events."
                        : "Notification enabled for creator's next event.",
            });
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
