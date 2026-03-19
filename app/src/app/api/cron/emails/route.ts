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

const DEFAULT_CRON_INTERVAL_HOURS = 24;
const REMINDER_LEAD_HOURS = 24;
const WORKSHOP_DURATION_HOURS = 2;
const FEEDBACK_DELAY_HOURS = 2;

function getWorkshopFromJoin(row: TargetBookingRow) {
    if (!row.workshops) return null;
    return Array.isArray(row.workshops) ? row.workshops[0] || null : row.workshops;
}

function getCronIntervalHours() {
    const parsed = Number(process.env.EMAIL_CRON_INTERVAL_HOURS);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CRON_INTERVAL_HOURS;
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
        const cronIntervalHours = getCronIntervalHours();
        const reminderWindowHours = REMINDER_LEAD_HOURS + cronIntervalHours;
        const feedbackWindowHours = FEEDBACK_DELAY_HOURS + Math.max(24, cronIntervalHours);
        const queryStart = new Date(
            now.getTime() - (feedbackWindowHours + WORKSHOP_DURATION_HOURS) * 60 * 60 * 1000
        );
        const queryEnd = new Date(now.getTime() + reminderWindowHours * 60 * 60 * 1000);
        const dateQueryStart = queryStart.toISOString().slice(0, 10);
        const dateQueryEnd = queryEnd.toISOString().slice(0, 10);

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
                const hoursSinceWorkshopEnd = -hoursUntilWorkshop - WORKSHOP_DURATION_HOURS;

                if (
                    hoursUntilWorkshop > 0 &&
                    hoursUntilWorkshop <= reminderWindowHours &&
                    !sentReminders.has(booking.id)
                ) {
                    await sendWorkshopReminder(booking.id);
                    remindersSent += 1;
                }

                if (
                    hoursSinceWorkshopEnd > FEEDBACK_DELAY_HOURS &&
                    hoursSinceWorkshopEnd <= feedbackWindowHours &&
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
