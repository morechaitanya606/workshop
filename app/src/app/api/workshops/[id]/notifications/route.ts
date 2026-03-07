import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedUser, jsonError } from "@/lib/api-auth";
import {
    createSupabaseServiceClient,
    isSupabaseServiceConfigured,
} from "@/lib/supabase-server";
import { workshopNotificationSchema } from "@/lib/validators";
import { ensureWorkshopSeededFromMock } from "@/lib/workshop-utils";

type NotificationRow = {
    notify_similar: boolean | null;
    notify_creator: boolean | null;
};

function mapNotificationState(record: NotificationRow | null | undefined) {
    return {
        similar: Boolean(record?.notify_similar),
        creator: Boolean(record?.notify_creator),
    };
}

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    if (!isSupabaseServiceConfigured) {
        return jsonError(
            "Supabase service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY.",
            500
        );
    }

    const workshopId = params.id;

    try {
        const serviceClient = createSupabaseServiceClient();
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

        if (error) {
            return jsonError("Unable to load notification preferences.", 500, error);
        }

        return NextResponse.json({
            subscriptions: mapNotificationState(data as NotificationRow | null),
        });
    } catch (error) {
        return jsonError(
            "Unable to load notification preferences.",
            500,
            String(error)
        );
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    if (!isSupabaseServiceConfigured) {
        return jsonError(
            "Supabase service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY.",
            500
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return jsonError("Invalid JSON payload.", 400);
    }

    const parsed = workshopNotificationSchema.safeParse(body);
    if (!parsed.success) {
        return jsonError("Invalid notification request.", 400, parsed.error.flatten());
    }

    const workshopId = params.id;

    try {
        const serviceClient = createSupabaseServiceClient();
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
        return jsonError(
            "Unable to save notification preference.",
            500,
            String(error)
        );
    }
}
