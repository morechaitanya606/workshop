import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import { handleApiError } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { sendFeedbackRequest, sendWorkshopReminder } from "@/lib/email";

type TargetBookingRow = {
    id: string;
    workshops:
        | {
              id: string;
              date: string;
              time: string | null;
          }
        | Array<{
              id: string;
              date: string;
              time: string | null;
          }>
        | null;
};

function getWorkshopFromJoin(row: TargetBookingRow) {
    if (!row.workshops) return null;
    return Array.isArray(row.workshops) ? row.workshops[0] || null : row.workshops;
}

function parseWorkshopStart(date: string, time: string | null) {
    const hhmm = String(time || "00:00").slice(0, 5);
    const parsed = new Date(`${date}T${hhmm}:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isAuthorizedCronRequest(request: Request) {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET?.trim();
    const isProd = process.env.NODE_ENV === "production";

    if (!cronSecret && isProd) {
        return {
            ok: false as const,
            response: jsonError(
                "CRON_SECRET is not configured. Refusing to run cron in production.",
                500
            ),
        };
    }

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return {
            ok: false as const,
            response: jsonError("Unauthorized", 401),
        };
    }

    return { ok: true as const };
}

export async function GET(request: Request) {
    const auth = isAuthorizedCronRequest(request);
    if (!auth.ok) return auth.response;

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }
    const supabase = service.client;

    try {
        // Fetch recently sent logs to avoid duplicate emails.
        const { data: sentLogs, error: logError } = await supabase
            .from("email_delivery_logs")
            .select("reference_id, template_name")
            .in("template_name", ["WorkshopReminder", "FeedbackRequest"]);

        if (logError) {
            throw logError;
        }

        const sentReminders = new Set(
            (sentLogs || [])
                .filter((log) => log.template_name === "WorkshopReminder" && log.reference_id)
                .map((log) => String(log.reference_id))
        );
        const sentFeedbacks = new Set(
            (sentLogs || [])
                .filter((log) => log.template_name === "FeedbackRequest" && log.reference_id)
                .map((log) => String(log.reference_id))
        );

        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const dayAfterTomorrow = new Date(now.getTime() + 48 * 60 * 60 * 1000);
        const dateQueryStart = yesterday.toISOString().slice(0, 10);
        const dateQueryEnd = dayAfterTomorrow.toISOString().slice(0, 10);

        const { data: targetBookings, error: bookingError } = await supabase
            .from("bookings")
            .select(
                `
                id,
                status,
                workshops!inner (
                    id,
                    date,
                    time
                )
            `
            )
            .eq("status", "confirmed")
            .gte("workshops.date", dateQueryStart)
            .lte("workshops.date", dateQueryEnd);

        if (bookingError) {
            throw bookingError;
        }

        let remindersSent = 0;
        let feedbackSent = 0;

        const jobs = ((targetBookings || []) as unknown as TargetBookingRow[]).map(
            async (booking) => {
                const workshop = getWorkshopFromJoin(booking);
                if (!workshop) return;

                const workshopStart = parseWorkshopStart(workshop.date, workshop.time);
                if (!workshopStart) return;

                const hoursUntilWorkshop =
                    (workshopStart.getTime() - now.getTime()) / (1000 * 60 * 60);
                const hoursSinceWorkshopEnd = -hoursUntilWorkshop - 2; // Approx. 2h workshop duration.

                if (
                    hoursUntilWorkshop > 0 &&
                    hoursUntilWorkshop <= 25 &&
                    !sentReminders.has(booking.id)
                ) {
                    await sendWorkshopReminder(booking.id);
                    remindersSent += 1;
                }

                if (
                    hoursSinceWorkshopEnd > 2 &&
                    hoursSinceWorkshopEnd <= 24 &&
                    !sentFeedbacks.has(booking.id)
                ) {
                    await sendFeedbackRequest(booking.id);
                    feedbackSent += 1;
                }
            }
        );

        await Promise.allSettled(jobs);

        return NextResponse.json({
            success: true,
            processed: targetBookings?.length || 0,
            remindersSent,
            feedbackSent,
        });
    } catch (error) {
        return handleApiError("Failed to process email cron.", error);
    }
}
