import { Resend } from "resend";
import { BookingConfirmationEmail } from "@/emails/BookingConfirmation";
import { WorkshopReminderEmail } from "@/emails/WorkshopReminder";
import { FeedbackRequestEmail } from "@/emails/FeedbackRequest";
import { createSupabaseServiceClient } from "./supabase-server";
import { claimIdempotencyKey, releaseIdempotencyKey } from "./idempotency";
import * as Sentry from "@sentry/nextjs";

const FROM_EMAIL = "Only Workshops <no-reply@updates.onlyworkshop.com>"; // Replace with verified domain
let resendClient: Resend | null = null;

function getResendClient() {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
        throw new Error("RESEND_API_KEY is not configured.");
    }

    if (!resendClient) {
        resendClient = new Resend(apiKey);
    }

    return resendClient;
}

interface SendEmailParams {
    to: string;
    subject: string;
    templateName: string;
    react: React.ReactElement;
    referenceId?: string;
}

const EMAIL_IDEMPOTENCY_SCOPE = "transactional-email";
const EMAIL_IDEMPOTENCY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * One send per (template, reference).
 *
 * `email_delivery_logs` records what happened but gates nothing, so every caller that can run
 * twice mails twice. The Razorpay webhook is exactly that caller: it releases its idempotency
 * key and asks for a redelivery whenever processing fails partway, and Razorpay retries for up
 * to 24 hours -- so a booking whose confirmation had already gone out got another copy on
 * every retry.
 *
 * Fails OPEN, unlike the payment paths. A dedup store that is unreachable must not cost a
 * customer their booking confirmation: a duplicate email is a far cheaper mistake than a
 * missing one.
 */
async function claimEmailSend(templateName: string, referenceId?: string) {
    if (!referenceId) {
        return { claimed: true, key: null as string | null };
    }

    const key = `${templateName}:${referenceId}`;

    try {
        const claimed = await claimIdempotencyKey(
            EMAIL_IDEMPOTENCY_SCOPE,
            key,
            EMAIL_IDEMPOTENCY_TTL_MS
        );
        return { claimed, key };
    } catch (error) {
        Sentry.captureException(error, {
            level: "warning",
            tags: { layer: "email", subsystem: "idempotency" },
            extra: { key },
        });
        return { claimed: true, key: null as string | null };
    }
}

/**
 * Robust wrapper to send email and log it to the database
 */
async function sendEmailAndLog({ to, subject, templateName, react, referenceId }: SendEmailParams) {
    const supabase = createSupabaseServiceClient();

    const emailClaim = await claimEmailSend(templateName, referenceId);
    if (!emailClaim.claimed) {
        return { success: true as const, skipped: true as const };
    }

    // 1. Create a "pending" log entry
    const { data: logEntry, error: logError } = await supabase
        .from("email_delivery_logs")
        .insert({
            recipient_email: to,
            subject,
            template_name: templateName,
            status: "pending",
            reference_id: referenceId,
        })
        .select()
        .single();

    if (logError) {
        Sentry.captureException(logError, {
            tags: { layer: "email", action: "insert_log" },
            extra: { to, subject, templateName },
        });
        // We still attempt to send the email even if logging fails
    }

    try {
        // 2. Send the email via Resend
        const { data: resendData, error: resendError } = await getResendClient().emails.send({
            from: FROM_EMAIL,
            to,
            subject,
            react,
        });

        if (resendError) {
            throw new Error(resendError.message);
        }

        // 3. Update log entry to "sent"
        if (logEntry) {
            await supabase
                .from("email_delivery_logs")
                .update({
                    status: "sent",
                    sent_at: new Date().toISOString(),
                })
                .eq("id", logEntry.id);
        }

        return { success: true, data: resendData };
    } catch (error: unknown) {
        Sentry.captureException(error, {
            tags: { layer: "email", action: "send" },
            extra: { to, subject, templateName },
        });

        const errorMessage =
            error instanceof Error
                ? error.message
                : typeof error === "string"
                  ? error
                  : "Unknown error";

        // 3. Update log entry to "failed"
        if (logEntry) {
            await supabase
                .from("email_delivery_logs")
                .update({
                    status: "failed",
                    error_message: errorMessage,
                })
                .eq("id", logEntry.id);
        }

        // The send failed, so let a retry try again rather than burning the claim on a mail
        // that was never delivered.
        if (emailClaim.key) {
            await releaseIdempotencyKey(EMAIL_IDEMPOTENCY_SCOPE, emailClaim.key);
        }

        return { success: false, error: errorMessage };
    }
}

/**
 * Fetches booking details and sends a booking confirmation
 */
export async function sendBookingConfirmation(bookingId: string) {
    const supabase = createSupabaseServiceClient();

    const { data: booking, error } = await supabase
        .from("bookings")
        .select(
            `
            *,
            workshops (
                id,
                title,
                date,
                time,
                location
            )
        `
        )
        .eq("id", bookingId)
        .single();

    if (error || !booking || !booking.workshops) {
        Sentry.captureMessage(`Could not fetch booking details for ${bookingId}`, {
            level: "error",
            tags: { layer: "email", action: "booking_confirmation" },
            extra: { bookingId, error },
        });
        return { success: false, error: "Booking not found" };
    }

    // Assuming we can coerce 'workshops' since we know it's selected as a single object but typed as array/single depending on relations
    const workshop = Array.isArray(booking.workshops) ? booking.workshops[0] : booking.workshops;

    return sendEmailAndLog({
        to: booking.email,
        subject: `Booking Confirmed: ${workshop.title}`,
        templateName: "BookingConfirmation",
        referenceId: booking.id,
        react: BookingConfirmationEmail({
            firstName: booking.first_name,
            workshopTitle: workshop.title,
            date: workshop.date,
            time: workshop.time,
            location: workshop.location,
            guests: booking.guests,
        }) as React.ReactElement,
    });
}

/**
 * Fetches booking details and sends a workshop reminder
 */
export async function sendWorkshopReminder(bookingId: string) {
    const supabase = createSupabaseServiceClient();

    const { data: booking, error } = await supabase
        .from("bookings")
        .select(
            `
            *,
            workshops (
                id,
                title,
                date,
                time,
                location
            )
        `
        )
        .eq("id", bookingId)
        .single();

    if (error || !booking || !booking.workshops) {
        Sentry.captureMessage(`Could not fetch booking details for ${bookingId}`, {
            level: "error",
            tags: { layer: "email", action: "workshop_reminder" },
            extra: { bookingId, error },
        });
        return { success: false, error: "Booking not found" };
    }

    const workshop = Array.isArray(booking.workshops) ? booking.workshops[0] : booking.workshops;

    return sendEmailAndLog({
        to: booking.email,
        subject: `Reminder: ${workshop.title} is coming up!`,
        templateName: "WorkshopReminder",
        referenceId: booking.id,
        react: WorkshopReminderEmail({
            firstName: booking.first_name,
            workshopTitle: workshop.title,
            date: workshop.date,
            time: workshop.time,
            location: workshop.location,
        }) as React.ReactElement,
    });
}

/**
 * Fetches booking details and sends a feedback request
 */
export async function sendFeedbackRequest(bookingId: string) {
    const supabase = createSupabaseServiceClient();

    const { data: booking, error } = await supabase
        .from("bookings")
        .select(
            `
            *,
            workshops (
                id,
                title
            )
        `
        )
        .eq("id", bookingId)
        .single();

    if (error || !booking || !booking.workshops) {
        Sentry.captureMessage(`Could not fetch booking details for ${bookingId}`, {
            level: "error",
            tags: { layer: "email", action: "feedback_request" },
            extra: { bookingId, error },
        });
        return { success: false, error: "Booking not found" };
    }

    const workshop = Array.isArray(booking.workshops) ? booking.workshops[0] : booking.workshops;

    return sendEmailAndLog({
        to: booking.email,
        subject: `How was ${workshop.title}?`,
        templateName: "FeedbackRequest",
        referenceId: booking.id,
        react: FeedbackRequestEmail({
            firstName: booking.first_name,
            workshopTitle: workshop.title,
            workshopId: workshop.id,
        }) as React.ReactElement,
    });
}
