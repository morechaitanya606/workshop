import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import { handleApiError } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import * as Sentry from "@sentry/nextjs";
import { sendBookingConfirmation, sendFeedbackRequest, sendWorkshopReminder } from "@/lib/email";

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
const CONFIRMATION_RETRY_WINDOW_HOURS = 72;
const MAX_CONFIRMATION_ATTEMPTS = 4;
const MAX_CONFIRMATION_RETRIES_PER_RUN = 100;
/** Workshop dates/times are entered in India time; Vercel's clock is UTC. */
const WORKSHOP_UTC_OFFSET = "+05:30";

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
    // Without an explicit offset this parsed as UTC on the server, so every reminder and
    // feedback window was shifted by 5h30m.
    const parsed = new Date(`${date}T${hhmm}:00${WORKSHOP_UTC_OFFSET}`);
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
        // Only rows that actually reached the provider count as sent. Previously any row
        // matched - including status 'failed' and 'pending' - so a feedback request that
        // failed to send was treated as delivered and never retried, which is why reviews
        // never accumulated. The query was also unbounded over the whole table; it is now
        // scoped to the window this run can act on.
        const logLookbackStart = new Date(
            Date.now() - (FEEDBACK_DELAY_HOURS + WORKSHOP_DURATION_HOURS + 24 * 30) * 60 * 60 * 1000
        ).toISOString();

        const { data: sentLogs, error: logError } = await supabase
            .from("email_delivery_logs")
            .select("reference_id, template_name")
            .in("template_name", ["WorkshopReminder", "FeedbackRequest"])
            .eq("status", "sent")
            .gte("created_at", logLookbackStart);

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
        let confirmationsRetried = 0;
        let failures = 0;

        // Work items are thunks, not promises. This used to build the list with
        // `.map(async ...)`, which STARTS every send the moment it is mapped, so the
        // "concurrency of 5" batching below it bounded nothing: every due booking hit the
        // provider at once, tripped its rate limit and was dropped. A failed send also still
        // counted as sent, because the senders report failure by return value, not by throwing.
        const queue: Array<() => Promise<void>> = [];

        const runSend = async (send: () => Promise<{ success: boolean }>, onSent: () => void) => {
            const result = await send();
            if (result.success) {
                onSent();
            } else {
                failures += 1;
            }
        };

        for (const booking of (targetBookings || []) as unknown as TargetBookingRow[]) {
            const workshop = getWorkshopFromJoin(booking);
            if (!workshop) continue;

            const workshopStart = parseWorkshopStart(workshop.date, workshop.time);
            if (!workshopStart) continue;

            const hoursUntilWorkshop = (workshopStart.getTime() - now.getTime()) / (1000 * 60 * 60);
            const hoursSinceWorkshopEnd = -hoursUntilWorkshop - WORKSHOP_DURATION_HOURS;

            if (
                hoursUntilWorkshop > 0 &&
                hoursUntilWorkshop <= reminderWindowHours &&
                !sentReminders.has(booking.id)
            ) {
                queue.push(() =>
                    runSend(
                        () => sendWorkshopReminder(booking.id),
                        () => {
                            remindersSent += 1;
                        }
                    )
                );
            }

            if (
                hoursSinceWorkshopEnd > FEEDBACK_DELAY_HOURS &&
                hoursSinceWorkshopEnd <= feedbackWindowHours &&
                !sentFeedbacks.has(booking.id)
            ) {
                queue.push(() =>
                    runSend(
                        () => sendFeedbackRequest(booking.id),
                        () => {
                            feedbackSent += 1;
                        }
                    )
                );
            }
        }

        // Booking confirmations are sent inline from the Razorpay webhook. If the provider
        // was rate-limited or out of quota at that moment the log row stays 'failed' and
        // nothing retried it, so the customer never got a confirmation. Pick those up here,
        // oldest first, giving up on a booking after MAX_CONFIRMATION_ATTEMPTS failures.
        const confirmationLookbackStart = new Date(
            Date.now() - CONFIRMATION_RETRY_WINDOW_HOURS * 60 * 60 * 1000
        ).toISOString();
        const { data: confirmationLogs, error: confirmationLogError } = await supabase
            .from("email_delivery_logs")
            .select("reference_id, status")
            .eq("template_name", "BookingConfirmation")
            .in("status", ["failed", "sent"])
            .not("reference_id", "is", null)
            .gte("created_at", confirmationLookbackStart);

        if (confirmationLogError) {
            throw confirmationLogError;
        }

        const confirmationState = new Map<string, { sent: boolean; failed: number }>();
        for (const log of confirmationLogs || []) {
            const id = String(log.reference_id);
            const state = confirmationState.get(id) ?? { sent: false, failed: 0 };
            if (log.status === "sent") state.sent = true;
            else state.failed += 1;
            confirmationState.set(id, state);
        }

        const candidateIds = Array.from(confirmationState.entries())
            .filter(([, state]) => !state.sent && state.failed < MAX_CONFIRMATION_ATTEMPTS)
            .map(([id]) => id)
            .slice(0, MAX_CONFIRMATION_RETRIES_PER_RUN);

        // A booking that was cancelled or refunded since must not get a "confirmed" mail now.
        let retryIds: string[] = [];
        if (candidateIds.length > 0) {
            const { data: stillConfirmed, error: confirmedError } = await supabase
                .from("bookings")
                .select("id")
                .in("id", candidateIds)
                .eq("status", "confirmed");

            if (confirmedError) {
                throw confirmedError;
            }
            retryIds = (stillConfirmed || []).map((row) => String(row.id));
        }

        for (const bookingId of retryIds) {
            queue.push(() =>
                runSend(
                    () => sendBookingConfirmation(bookingId),
                    () => {
                        confirmationsRetried += 1;
                    }
                )
            );
        }

        // One at a time. The provider layer already spaces sends to stay under each
        // provider's rate limit, so extra concurrency here would only queue behind it.
        for (const job of queue) {
            try {
                await job();
            } catch (error) {
                failures += 1;
                Sentry.captureException(error, { tags: { layer: "cron", route: "emails" } });
            }
        }

        // Housekeeping: the idempotency/webhook-event table otherwise grows forever and keeps
        // customer email/phone in old payloads. Best effort -- the function only exists once
        // the 20261001100800 migration is applied, and a failure here must not fail the run.
        try {
            // Not in the generated types until `gen:supabase-types` is re-run.
            const { error: purgeError } = await (
                supabase as unknown as {
                    rpc: (
                        fn: string,
                        args: object
                    ) => Promise<{ error: { message: string } | null }>;
                }
            ).rpc("purge_old_webhook_events", { p_retain_days: 30 });
            if (purgeError) {
                Sentry.captureMessage(`purge_old_webhook_events failed: ${purgeError.message}`, {
                    level: "warning",
                    tags: { layer: "cron", route: "emails" },
                });
            }
        } catch (error) {
            Sentry.captureException(error, {
                level: "warning",
                tags: { layer: "cron", route: "emails", step: "purge" },
            });
        }

        return NextResponse.json({
            success: true,
            processed: targetBookings?.length || 0,
            remindersSent,
            feedbackSent,
            confirmationsRetried,
            failures,
        });
    } catch (error) {
        return handleApiError("Failed to process email cron.", error);
    }
}
