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

/**
 * jsdom's File has no arrayBuffer(), so the route would fall back to stringifying it. Give the
 * test file the Node/browser behaviour the route relies on in production.
 */
function makeFile(parts: Array<string | Uint8Array>, name: string, options: FilePropertyBag) {
    const encoder = new TextEncoder();
    const bytes = Buffer.concat(
        parts.map((part) => (typeof part === "string" ? encoder.encode(part) : part))
    );
    const file = new File(parts as BlobPart[], name, options);
    Object.defineProperty(file, "arrayBuffer", {
        value: async () =>
            bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    });
    return file;
}

const PDF_BODY = "%PDF-1.4\nresume-body";

function buildApplication(resume: File) {
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
    formData.append("resume", resume);
    return formData;
}

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
            makeFile([PDF_BODY], "aarav-resume.pdf", { type: "application/pdf" })
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
        formData.append("resume", makeFile(["plain-text"], "resume.txt", { type: "text/plain" }));

        const response = await POST(createRequest(formData));
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error).toBe("Resume must be a PDF, DOC, or DOCX file.");
        expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it("rejects an executable that claims to be a PDF", async () => {
        const response = await POST(
            createRequest(
                buildApplication(makeFile([PDF_BODY], "payload.exe", { type: "application/pdf" }))
            )
        );

        expect(response.status).toBe(400);
        expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it("rejects an allowed extension whose MIME type is not the matching one", async () => {
        const response = await POST(
            createRequest(
                buildApplication(
                    makeFile([PDF_BODY], "resume.pdf", { type: "application/octet-stream" })
                )
            )
        );

        expect(response.status).toBe(400);
        expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it("rejects content whose magic bytes do not match the declared type", async () => {
        const response = await POST(
            createRequest(
                buildApplication(
                    makeFile(["MZ\u0090\u0000 not a pdf"], "resume.pdf", {
                        type: "application/pdf",
                    })
                )
            )
        );
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error).toBe("Resume must be a PDF, DOC, or DOCX file.");
        expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it("accepts a DOCX (ZIP) and forces the stored extension and content type", async () => {
        const docx = makeFile([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])], "My CV.DOCX", {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });

        const response = await POST(createRequest(buildApplication(docx)));

        expect(response.status).toBe(200);
        expect(sendEmailMock).toHaveBeenCalledWith(
            expect.objectContaining({
                attachments: [
                    expect.objectContaining({
                        filename: "My_CV.docx",
                        contentType:
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    }),
                ],
            })
        );
    });

    it("accepts a legacy DOC (OLE2) file", async () => {
        const doc = makeFile(
            [new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0])],
            "cv.doc",
            { type: "application/msword" }
        );

        const response = await POST(createRequest(buildApplication(doc)));

        expect(response.status).toBe(200);
    });

    it("rejects applications with invalid email addresses", async () => {
        const formData = new FormData();
        formData.append("fullName", "Aarav Sharma");
        formData.append("email", "not-an-email");
        formData.append("phone", "+91 99999 88888");
        formData.append("location", "Bengaluru");
        formData.append("role", "Photographer");
        formData.append(
            "coverLetter",
            "I have spent the last four years building photo stories and campaign assets for creative brands."
        );
        formData.append(
            "resume",
            makeFile([PDF_BODY], "aarav-resume.pdf", { type: "application/pdf" })
        );

        const response = await POST(createRequest(formData));
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error).toBe("Invalid careers application payload.");
        expect(sendEmailMock).not.toHaveBeenCalled();
    });
});
