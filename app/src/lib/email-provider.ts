import { Resend } from "resend";

/**
 * Transport layer for outgoing mail.
 *
 * Two providers sit behind one function so a quota or outage at one of them no longer means
 * lost mail:
 *
 *   - Mailjet (REST v3.1, plain fetch -- no SDK): the default whenever its keys are set.
 *   - Resend: the fallback, and the default when only RESEND_API_KEY is set.
 *
 * `EMAIL_PROVIDER=mailjet|resend` pins the primary. The other one, if configured, is tried
 * automatically when the primary reports a quota or rate-limit error or is down.
 *
 * Resend's free plan allows 100 mails/day and 2 requests/second. A burst of bookings used to
 * hit that wall and drop mail; every send now goes through a per-instance throttle and a
 * bounded retry, and falls over to the second provider instead of failing.
 */

export type EmailAttachment = {
    filename: string;
    content: Buffer;
    contentType: string;
};

export type OutgoingEmail = {
    to: string;
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
    attachments?: EmailAttachment[];
};

export type EmailProviderName = "mailjet" | "resend";

export type EmailSendResult = {
    provider: EmailProviderName;
    messageId: string | null;
};

export class EmailSendError extends Error {
    constructor(
        message: string,
        readonly provider: EmailProviderName,
        /** Worth trying again on the same provider: rate limit, 5xx, network. */
        readonly retryable: boolean,
        /** The provider has stopped accepting mail for now (daily/monthly cap). */
        readonly quota: boolean,
        readonly retryAfterMs?: number
    ) {
        super(message);
        this.name = "EmailSendError";
    }
}

// The only mailbox on the domain. It must be a validated sender in Mailjet (or the domain
// verified in Resend), or the provider refuses the mail.
const DEFAULT_FROM = "Only Workshops <reachout@onlyworkshops.com>";
const MAILJET_ENDPOINT = "https://api.mailjet.com/v3.1/send";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS_PER_PROVIDER = 3;
const MAX_BACKOFF_MS = 5_000;

/** Gap enforced between sends from one instance. Resend allows 2/s, so stay under that. */
const DEFAULT_MIN_INTERVAL_MS: Record<EmailProviderName, number> = {
    resend: 600,
    mailjet: 150,
};

function getFromAddress() {
    return process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
}

/** "Name <a@b.com>" -> { name, email }; a bare address has no name. */
function parseAddress(value: string) {
    const match = value.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/);
    if (match) {
        return { name: match[1]?.trim() || undefined, email: match[2].trim() };
    }
    return { name: undefined, email: value.trim() };
}

function isConfigured(provider: EmailProviderName) {
    if (provider === "mailjet") {
        return Boolean(
            process.env.MAILJET_API_KEY?.trim() && process.env.MAILJET_SECRET_KEY?.trim()
        );
    }
    return Boolean(process.env.RESEND_API_KEY?.trim());
}

/** Providers to try, in order. Empty when nothing is configured. */
export function getProviderChain(): EmailProviderName[] {
    const pinned = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
    const order: EmailProviderName[] =
        pinned === "resend" ? ["resend", "mailjet"] : ["mailjet", "resend"];
    return order.filter(isConfigured);
}

export function isEmailConfigured() {
    return getProviderChain().length > 0;
}

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function getMinIntervalMs(provider: EmailProviderName) {
    const override = Number(process.env.EMAIL_MIN_INTERVAL_MS);
    return Number.isFinite(override) && override >= 0
        ? override
        : DEFAULT_MIN_INTERVAL_MS[provider];
}

const nextSlotAt: Record<EmailProviderName, number> = { resend: 0, mailjet: 0 };

/**
 * Reserve the next send slot for a provider and wait for it.
 *
 * The reservation is synchronous, so concurrent callers in one instance queue up in order
 * instead of racing. Separate serverless instances do not share this; the retry and the
 * failover below cover the case where two of them collide.
 */
async function waitForSlot(provider: EmailProviderName) {
    const now = Date.now();
    const start = Math.max(now, nextSlotAt[provider]);
    nextSlotAt[provider] = start + getMinIntervalMs(provider);
    if (start > now) {
        await sleep(start - now);
    }
}

function parseRetryAfterMs(header: string | null) {
    if (!header) return undefined;
    const seconds = Number(header);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

async function sendViaMailjet(message: OutgoingEmail): Promise<EmailSendResult> {
    const apiKey = process.env.MAILJET_API_KEY?.trim();
    const secretKey = process.env.MAILJET_SECRET_KEY?.trim();
    if (!apiKey || !secretKey) {
        throw new EmailSendError("Mailjet is not configured.", "mailjet", false, false);
    }

    const from = parseAddress(getFromAddress());
    const body = {
        Messages: [
            {
                From: { Email: from.email, ...(from.name ? { Name: from.name } : {}) },
                To: [{ Email: message.to }],
                ...(message.replyTo ? { ReplyTo: { Email: message.replyTo } } : {}),
                Subject: message.subject,
                HTMLPart: message.html,
                ...(message.text ? { TextPart: message.text } : {}),
                ...(message.attachments?.length
                    ? {
                          Attachments: message.attachments.map((attachment) => ({
                              ContentType: attachment.contentType || "application/octet-stream",
                              Filename: attachment.filename,
                              Base64Content: attachment.content.toString("base64"),
                          })),
                      }
                    : {}),
            },
        ],
    };

    let response: Response;
    try {
        response = await fetch(MAILJET_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Basic ${Buffer.from(`${apiKey}:${secretKey}`).toString("base64")}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch (error) {
        throw new EmailSendError(
            `Mailjet request failed: ${error instanceof Error ? error.message : "network error"}`,
            "mailjet",
            true,
            false
        );
    }

    const payload = (await response.json().catch(() => null)) as {
        ErrorMessage?: string;
        Messages?: Array<{
            Status?: string;
            Errors?: Array<{ ErrorMessage?: string }>;
            To?: Array<{ MessageUUID?: string; MessageID?: number | string }>;
        }>;
    } | null;

    const first = payload?.Messages?.[0];
    if (response.ok && first?.Status === "success") {
        const recipient = first.To?.[0];
        const messageId = recipient?.MessageUUID ?? recipient?.MessageID;
        return { provider: "mailjet", messageId: messageId != null ? String(messageId) : null };
    }

    const detail =
        first?.Errors?.[0]?.ErrorMessage || payload?.ErrorMessage || `HTTP ${response.status}`;
    const rateLimited = response.status === 429;
    const serverError = response.status >= 500;
    throw new EmailSendError(
        `Mailjet rejected the message: ${detail}`,
        "mailjet",
        rateLimited || serverError,
        // Mailjet reports an exhausted sending allowance as a 429/quota error. Retrying within
        // the same request cannot help, but the other provider can still take the mail.
        rateLimited && /quota|limit|exceed/i.test(detail),
        parseRetryAfterMs(response.headers.get("retry-after"))
    );
}

let resendClient: Resend | null = null;

function getResendClient() {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
        throw new EmailSendError("RESEND_API_KEY is not configured.", "resend", false, false);
    }
    if (!resendClient) {
        resendClient = new Resend(apiKey);
    }
    return resendClient;
}

async function sendViaResend(message: OutgoingEmail): Promise<EmailSendResult> {
    let result: Awaited<ReturnType<Resend["emails"]["send"]>>;
    try {
        result = await getResendClient().emails.send({
            from: getFromAddress(),
            to: message.to,
            subject: message.subject,
            html: message.html,
            ...(message.text ? { text: message.text } : {}),
            ...(message.replyTo ? { replyTo: message.replyTo } : {}),
            ...(message.attachments?.length
                ? {
                      attachments: message.attachments.map((attachment) => ({
                          filename: attachment.filename,
                          content: attachment.content,
                          contentType: attachment.contentType,
                      })),
                  }
                : {}),
        });
    } catch (error) {
        if (error instanceof EmailSendError) throw error;
        throw new EmailSendError(
            `Resend request failed: ${error instanceof Error ? error.message : "network error"}`,
            "resend",
            true,
            false
        );
    }

    if (result.error) {
        const {
            name,
            message: detail,
            statusCode,
        } = result.error as {
            name?: string;
            message: string;
            statusCode?: number | null;
        };
        const quota = /quota/i.test(name ?? "") || /quota|daily limit/i.test(detail);
        const rateLimited = statusCode === 429 || /rate_limit/i.test(name ?? "");
        const serverError = typeof statusCode === "number" && statusCode >= 500;
        throw new EmailSendError(detail, "resend", !quota && (rateLimited || serverError), quota);
    }

    return { provider: "resend", messageId: result.data?.id ?? null };
}

async function sendWithRetry(
    provider: EmailProviderName,
    message: OutgoingEmail
): Promise<EmailSendResult> {
    let lastError: EmailSendError | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_PROVIDER; attempt += 1) {
        await waitForSlot(provider);
        try {
            return provider === "mailjet"
                ? await sendViaMailjet(message)
                : await sendViaResend(message);
        } catch (error) {
            const sendError =
                error instanceof EmailSendError
                    ? error
                    : new EmailSendError(
                          error instanceof Error ? error.message : "Unknown email error",
                          provider,
                          false,
                          false
                      );
            lastError = sendError;

            // A quota error will not clear inside this request, and a permanent error (bad
            // address, unverified sender) will not clear at all. Only transient failures retry.
            if (!sendError.retryable || sendError.quota || attempt === MAX_ATTEMPTS_PER_PROVIDER) {
                throw sendError;
            }

            const backoff = Math.min(
                sendError.retryAfterMs ?? 1000 * 2 ** (attempt - 1),
                MAX_BACKOFF_MS
            );
            await sleep(backoff);
        }
    }

    throw lastError ?? new EmailSendError("Email send failed.", provider, false, false);
}

/**
 * Deliver one message. Tries the primary provider (with bounded retries), then the other one
 * if it is configured and the primary failed for a reason the other could fix.
 *
 * Throws EmailSendError when nothing could deliver it; callers log that and leave the message
 * for a later retry.
 */
export async function deliverEmail(message: OutgoingEmail): Promise<EmailSendResult> {
    const chain = getProviderChain();
    if (chain.length === 0) {
        throw new EmailSendError(
            "No email provider is configured. Set MAILJET_API_KEY and MAILJET_SECRET_KEY, or RESEND_API_KEY.",
            "mailjet",
            false,
            false
        );
    }

    let lastError: EmailSendError | null = null;

    for (const provider of chain) {
        try {
            return await sendWithRetry(provider, message);
        } catch (error) {
            lastError =
                error instanceof EmailSendError
                    ? error
                    : new EmailSendError(String(error), provider, false, false);

            // A rejected message (invalid address, content refused) fails the same way
            // everywhere, so there is nothing to gain by asking the second provider.
            if (!lastError.retryable && !lastError.quota) {
                throw lastError;
            }
        }
    }

    throw lastError ?? new EmailSendError("Email send failed.", chain[0], false, false);
}
