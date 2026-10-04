import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resendSendMock } = vi.hoisted(() => ({ resendSendMock: vi.fn() }));

vi.mock("resend", () => ({
    Resend: class {
        emails = { send: resendSendMock };
    },
}));

import { deliverEmail, getProviderChain, isEmailConfigured } from "./email-provider";

const MESSAGE = { to: "guest@example.com", subject: "Hello", html: "<p>Hi</p>", text: "Hi" };

function mailjetSuccess() {
    return new Response(
        JSON.stringify({
            Messages: [{ Status: "success", To: [{ MessageUUID: "uuid-1", MessageID: 1 }] }],
        }),
        { status: 200 }
    );
}

function mailjetFailure(status: number, errorMessage: string) {
    return new Response(
        JSON.stringify({
            Messages: [{ Status: "error", Errors: [{ ErrorMessage: errorMessage }] }],
        }),
        { status }
    );
}

describe("email provider", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal("fetch", fetchMock);
        // No inter-send spacing and no real backoff waits in tests.
        vi.stubEnv("EMAIL_MIN_INTERVAL_MS", "0");
        vi.stubEnv("MAILJET_API_KEY", "mj-key");
        vi.stubEnv("MAILJET_SECRET_KEY", "mj-secret");
        vi.stubEnv("RESEND_API_KEY", "re_key");
        vi.stubEnv("EMAIL_PROVIDER", "");
        vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("prefers Mailjet and falls back to Resend by default", () => {
        expect(getProviderChain()).toEqual(["mailjet", "resend"]);
    });

    it("honours EMAIL_PROVIDER=resend and skips providers without keys", () => {
        vi.stubEnv("EMAIL_PROVIDER", "resend");
        expect(getProviderChain()).toEqual(["resend", "mailjet"]);

        vi.stubEnv("MAILJET_SECRET_KEY", "");
        expect(getProviderChain()).toEqual(["resend"]);
    });

    it("reports unconfigured when no keys are set", () => {
        vi.stubEnv("MAILJET_API_KEY", "");
        vi.stubEnv("RESEND_API_KEY", "");
        expect(isEmailConfigured()).toBe(false);
    });

    it("sends through Mailjet with basic auth and the v3.1 payload", async () => {
        fetchMock.mockResolvedValueOnce(mailjetSuccess());

        const result = await deliverEmail({
            ...MESSAGE,
            replyTo: "reply@example.com",
            attachments: [
                { filename: "cv.pdf", content: Buffer.from("pdf"), contentType: "application/pdf" },
            ],
        });

        expect(result).toEqual({ provider: "mailjet", messageId: "uuid-1" });
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://api.mailjet.com/v3.1/send");
        expect(init.headers.Authorization).toBe(
            `Basic ${Buffer.from("mj-key:mj-secret").toString("base64")}`
        );
        const sent = JSON.parse(init.body).Messages[0];
        expect(sent.From).toEqual({
            Email: "reachout@onlyworkshops.com",
            Name: "Only Workshops",
        });
        expect(sent.To).toEqual([{ Email: "guest@example.com" }]);
        expect(sent.ReplyTo).toEqual({ Email: "reply@example.com" });
        expect(sent.HTMLPart).toBe("<p>Hi</p>");
        expect(sent.Attachments).toEqual([
            {
                ContentType: "application/pdf",
                Filename: "cv.pdf",
                Base64Content: Buffer.from("pdf").toString("base64"),
            },
        ]);
        expect(resendSendMock).not.toHaveBeenCalled();
    });

    it("retries a transient Mailjet failure before giving up on it", async () => {
        fetchMock
            .mockResolvedValueOnce(mailjetFailure(503, "unavailable"))
            .mockResolvedValueOnce(mailjetSuccess());

        const result = await deliverEmail(MESSAGE);

        expect(result.provider).toBe("mailjet");
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(resendSendMock).not.toHaveBeenCalled();
    });

    it("fails over to Resend immediately when Mailjet's quota is exhausted", async () => {
        fetchMock.mockResolvedValueOnce(mailjetFailure(429, "Daily sending limit exceeded"));
        resendSendMock.mockResolvedValueOnce({ data: { id: "re_1" }, error: null });

        const result = await deliverEmail(MESSAGE);

        expect(result).toEqual({ provider: "resend", messageId: "re_1" });
        // Quota is not retried in place.
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not ask the second provider about a permanently rejected message", async () => {
        fetchMock.mockResolvedValueOnce(mailjetFailure(400, "Invalid recipient address"));

        await expect(deliverEmail(MESSAGE)).rejects.toThrow(/Invalid recipient/);
        expect(resendSendMock).not.toHaveBeenCalled();
    });

    it("throws when every provider is unavailable", async () => {
        fetchMock.mockResolvedValue(mailjetFailure(500, "boom"));
        resendSendMock.mockResolvedValue({
            data: null,
            error: { name: "daily_quota_exceeded", message: "quota", statusCode: 429 },
        });

        await expect(deliverEmail(MESSAGE)).rejects.toThrow();
        expect(resendSendMock).toHaveBeenCalledTimes(1);
    });

    it("uses Resend alone when Mailjet is not configured", async () => {
        vi.stubEnv("MAILJET_API_KEY", "");
        resendSendMock.mockResolvedValueOnce({ data: { id: "re_2" }, error: null });

        const result = await deliverEmail({ ...MESSAGE, replyTo: "r@example.com" });

        expect(result).toEqual({ provider: "resend", messageId: "re_2" });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(resendSendMock).toHaveBeenCalledWith(
            expect.objectContaining({
                to: "guest@example.com",
                html: "<p>Hi</p>",
                replyTo: "r@example.com",
            })
        );
    });

    it("spaces consecutive sends instead of bursting", async () => {
        vi.stubEnv("EMAIL_MIN_INTERVAL_MS", "400");
        fetchMock.mockImplementation(async () => mailjetSuccess());

        const started: number[] = [];
        const origNow = Date.now.bind(Date);
        fetchMock.mockImplementation(async () => {
            started.push(origNow());
            return mailjetSuccess();
        });

        await Promise.all([deliverEmail(MESSAGE), deliverEmail(MESSAGE), deliverEmail(MESSAGE)]);

        expect(started).toHaveLength(3);
        expect(started[1] - started[0]).toBeGreaterThanOrEqual(350);
        expect(started[2] - started[1]).toBeGreaterThanOrEqual(350);
    });
});
