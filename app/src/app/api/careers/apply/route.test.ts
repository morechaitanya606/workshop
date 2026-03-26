import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendEmailMock } = vi.hoisted(() => ({
    sendEmailMock: vi.fn(),
}));

vi.mock("resend", () => ({
    Resend: class {
        emails = {
            send: sendEmailMock,
        };
    },
}));

vi.mock("@/lib/rate-limit", () => ({
    assertRateLimit: vi.fn(),
    getRateLimitKey: vi.fn(() => "careers-apply-test"),
}));

vi.mock("@/lib/api-auth", () => ({
    jsonError: vi.fn((message: string, status = 400, details?: unknown) =>
        NextResponse.json(
            {
                error: message,
                details: details ?? null,
            },
            { status }
        )
    ),
}));

import { assertRateLimit } from "@/lib/rate-limit";
import { POST } from "./route";

function createRequest(formData: FormData) {
    return {
        formData: vi.fn().mockResolvedValue(formData),
        headers: new Headers(),
        nextUrl: new URL("http://localhost/api/careers/apply"),
    } as unknown as NextRequest;
}

describe("POST /api/careers/apply", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(assertRateLimit).mockResolvedValue({ ok: true } as any);
        sendEmailMock.mockResolvedValue({ data: { id: "email_123" }, error: null });
        process.env.RESEND_API_KEY = "re_test_key";
        process.env.CAREERS_INBOX_EMAIL = "hello@onlyworkshop.com";
    });

    it("submits an application with a resume attachment", async () => {
        const formData = new FormData();
        formData.append("fullName", "Aarav Sharma");
        formData.append("email", "aarav@example.com");
        formData.append("phone", "+91 99999 88888");
        formData.append("location", "Bengaluru");
        formData.append("role", "Photographer");
        formData.append("portfolioUrl", "https://portfolio.example.com");
        formData.append(
            "coverLetter",
            "I have spent the last four years building photo stories and campaign assets for creative brands."
        );
        formData.append(
            "resume",
            new File(["resume-body"], "aarav-resume.pdf", { type: "application/pdf" })
        );

        const response = await POST(createRequest(formData));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.message).toContain("Thanks for applying");
        expect(sendEmailMock).toHaveBeenCalledWith(
            expect.objectContaining({
                to: "hello@onlyworkshop.com",
                replyTo: "aarav@example.com",
                attachments: [
                    expect.objectContaining({
                        filename: "aarav-resume.pdf",
                        contentType: "application/pdf",
                    }),
                ],
            })
        );
    });

    it("rejects unsupported resume file types", async () => {
        const formData = new FormData();
        formData.append("fullName", "Aarav Sharma");
        formData.append("email", "aarav@example.com");
        formData.append("phone", "+91 99999 88888");
        formData.append("location", "Bengaluru");
        formData.append("role", "Photographer");
        formData.append(
            "coverLetter",
            "I have spent the last four years building photo stories and campaign assets for creative brands."
        );
        formData.append(
            "resume",
            new File(["plain-text"], "resume.txt", { type: "text/plain" })
        );

        const response = await POST(createRequest(formData));
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error).toBe("Resume must be a PDF, DOC, or DOCX file.");
        expect(sendEmailMock).not.toHaveBeenCalled();
    });
});
