import type { Attachment } from "resend";
import { Resend } from "resend";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { CareerApplicationEmail } from "@/emails/CareerApplication";
import { jsonError } from "@/lib/api-auth";
import { handleApiError } from "@/lib/api-route";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { careersApplicationSchema } from "@/lib/validators";

export const runtime = "nodejs";

const FROM_EMAIL = "Only Workshops <no-reply@updates.onlyworkshop.com>";
const DEFAULT_CAREERS_INBOX = "hello@onlyworkshop.com";
const MAX_RESUME_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_RESUME_TYPES = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const ALLOWED_RESUME_EXTENSIONS = new Set(["pdf", "doc", "docx"]);

function getCareersInboxEmail() {
    return process.env.CAREERS_INBOX_EMAIL?.trim() || DEFAULT_CAREERS_INBOX;
}

function getResendClient() {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
        throw new Error("RESEND_API_KEY is not configured.");
    }

    return new Resend(apiKey);
}

function sanitizeFileName(fileName: string) {
    const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    return sanitized || "resume.pdf";
}

function getStringField(formData: FormData, fieldName: string) {
    const value = formData.get(fieldName);
    return typeof value === "string" ? value : "";
}

function validateResumeFile(file: File | null) {
    if (!file) {
        return "Resume is required.";
    }

    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!ALLOWED_RESUME_TYPES.has(file.type) && !ALLOWED_RESUME_EXTENSIONS.has(extension)) {
        return "Resume must be a PDF, DOC, or DOCX file.";
    }

    if (file.size > MAX_RESUME_SIZE_BYTES) {
        return "Resume must be 5MB or smaller.";
    }

    return null;
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

        const resumeError = validateResumeFile(resume);
        if (resumeError) {
            return jsonError(resumeError, 400);
        }

        if (!process.env.RESEND_API_KEY?.trim()) {
            return jsonError(
                "Careers email is not configured yet. Please set RESEND_API_KEY on the server.",
                500
            );
        }

        const attachmentBuffer = await fileToBuffer(resume);
        const attachment: Attachment = {
            filename: sanitizeFileName(resume.name),
            content: attachmentBuffer,
            contentType: resume.type,
        };
        const resumeFileName =
            typeof attachment.filename === "string" ? attachment.filename : "resume.pdf";

        const inboxEmail = getCareersInboxEmail();
        const subject = `Career application: ${parsed.data.fullName} - ${parsed.data.role}`;
        const { error } = await getResendClient().emails.send({
            from: FROM_EMAIL,
            to: inboxEmail,
            replyTo: parsed.data.email,
            subject,
            react: CareerApplicationEmail({
                ...parsed.data,
                resumeFileName,
            }),
            attachments: [attachment],
        });

        if (error) {
            throw new Error(error.message);
        }

        return NextResponse.json({
            message: "Thanks for applying. Your resume has been sent to our team.",
        });
    } catch (error) {
        return handleApiError("Failed to submit careers application.", error);
    }
}
