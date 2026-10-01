import { render } from "@react-email/components";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { CareerApplicationEmail } from "@/emails/CareerApplication";
import { jsonError } from "@/lib/api-auth";
import { handleApiError } from "@/lib/api-route";
import { deliverEmail, isEmailConfigured } from "@/lib/email-provider";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { careersApplicationSchema } from "@/lib/validators";

export const runtime = "nodejs";

const DEFAULT_CAREERS_INBOX = "hello@onlyworkshop.com";
const MAX_RESUME_SIZE_BYTES = 5 * 1024 * 1024;
const RESUME_TYPE_ERROR = "Resume must be a PDF, DOC, or DOCX file.";

/**
 * Extension and MIME type must BOTH be allowed and agree with each other. Accepting either one
 * let `payload.exe` (declared application/pdf) through to the HR inbox, because the browser's
 * MIME type is just a string the sender picks.
 */
const RESUME_TYPES_BY_EXTENSION: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function getCareersInboxEmail() {
    return process.env.CAREERS_INBOX_EMAIL?.trim() || DEFAULT_CAREERS_INBOX;
}

function getResumeExtension(fileName: string) {
    const lastDot = fileName.lastIndexOf(".");
    if (lastDot < 0) return "";
    return fileName
        .slice(lastDot + 1)
        .toLowerCase()
        .trim();
}

/** Base name from the upload, never its extension: the stored extension comes from the sniffed type. */
function buildStoredResumeFileName(originalName: string, extension: string) {
    const lastDot = originalName.lastIndexOf(".");
    const baseName = lastDot > 0 ? originalName.slice(0, lastDot) : originalName;
    const sanitizedBase = baseName
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 100);
    return `${sanitizedBase || "resume"}.${extension}`;
}

function getStringField(formData: FormData, fieldName: string) {
    const value = formData.get(fieldName);
    return typeof value === "string" ? value : "";
}

function startsWithBytes(buffer: Buffer, signature: number[], offset = 0) {
    if (buffer.length < offset + signature.length) return false;
    return signature.every((byte, index) => buffer[offset + index] === byte);
}

/** Does the content actually look like the format the extension claims? */
function matchesResumeSignature(buffer: Buffer, extension: string) {
    if (extension === "pdf") {
        // The spec allows up to 1024 bytes of leading junk before the header.
        return buffer.subarray(0, 1024).includes("%PDF-");
    }
    if (extension === "doc") {
        // OLE2 / Compound File Binary header.
        return startsWithBytes(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    }
    if (extension === "docx") {
        // OOXML is a ZIP container.
        return startsWithBytes(buffer, [0x50, 0x4b, 0x03, 0x04]);
    }
    return false;
}

function validateResumeMetadata(file: File | null) {
    if (!file) {
        return { error: "Resume is required." } as const;
    }

    const extension = getResumeExtension(file.name);
    const expectedType = RESUME_TYPES_BY_EXTENSION[extension];
    const declaredType = (file.type || "").split(";")[0].trim().toLowerCase();
    if (!expectedType || declaredType !== expectedType) {
        return { error: RESUME_TYPE_ERROR } as const;
    }

    if (file.size > MAX_RESUME_SIZE_BYTES) {
        return { error: "Resume must be 5MB or smaller." } as const;
    }

    return { error: null, extension, contentType: expectedType } as const;
}

async function fileToBuffer(file: File) {
    if (typeof file.arrayBuffer === "function") {
        return Buffer.from(await file.arrayBuffer());
    }

    return Buffer.from(await new Response(file).arrayBuffer());
}

export async function POST(request: NextRequest) {
    const rateLimitResult = await assertRateLimit({
        key: getRateLimitKey(request, "careers-application-submit"),
        limit: 5,
        windowMs: 10 * 60_000,
        message: "Too many application attempts. Please wait a few minutes and try again.",
        // Every accepted request sends an e-mail: do not let an Upstash outage lift the ceiling.
        strict: true,
    });
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    try {
        const formData = await request.formData();
        const resume = formData.get("resume");

        const parsed = careersApplicationSchema.safeParse({
            fullName: getStringField(formData, "fullName"),
            email: getStringField(formData, "email"),
            phone: getStringField(formData, "phone"),
            location: getStringField(formData, "location"),
            role: getStringField(formData, "role"),
            portfolioUrl: getStringField(formData, "portfolioUrl"),
            coverLetter: getStringField(formData, "coverLetter"),
        });

        if (!parsed.success) {
            return jsonError("Invalid careers application payload.", 400, parsed.error.flatten());
        }

        if (!(resume instanceof File)) {
            return jsonError("Resume is required.", 400);
        }

        const resumeCheck = validateResumeMetadata(resume);
        if (resumeCheck.error) {
            return jsonError(resumeCheck.error, 400);
        }

        if (!isEmailConfigured()) {
            return jsonError(
                "Careers email is not configured yet. Please set MAILJET_API_KEY and MAILJET_SECRET_KEY (or RESEND_API_KEY) on the server.",
                500
            );
        }

        const attachmentBuffer = await fileToBuffer(resume);
        if (
            attachmentBuffer.byteLength > MAX_RESUME_SIZE_BYTES ||
            !matchesResumeSignature(attachmentBuffer, resumeCheck.extension)
        ) {
            return jsonError(RESUME_TYPE_ERROR, 400);
        }

        const resumeFileName = buildStoredResumeFileName(resume.name, resumeCheck.extension);

        const inboxEmail = getCareersInboxEmail();
        const subject = `Career application: ${parsed.data.fullName} - ${parsed.data.role}`;
        const emailElement = CareerApplicationEmail({
            ...parsed.data,
            resumeFileName,
        });
        const [html, text] = await Promise.all([
            render(emailElement),
            render(emailElement, { plainText: true }),
        ]);

        await deliverEmail({
            to: inboxEmail,
            replyTo: parsed.data.email,
            subject,
            html,
            text,
            attachments: [
                {
                    filename: resumeFileName,
                    content: attachmentBuffer,
                    contentType: resumeCheck.contentType,
                },
            ],
        });

        return NextResponse.json({
            message: "Thanks for applying. Your resume has been sent to our team.",
        });
    } catch (error) {
        return handleApiError("Failed to submit careers application.", error);
    }
}
