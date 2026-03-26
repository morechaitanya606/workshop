"use client";

import { useRef, useState } from "react";
import { Loader2, UploadCloud } from "lucide-react";
import { useToast } from "@/components/ToastProvider";

const MAX_RESUME_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_RESUME_TYPES = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const ACCEPTED_RESUME_EXTENSIONS = new Set(["pdf", "doc", "docx"]);
const ROLE_OPTIONS = [
    "Director",
    "Storyteller",
    "Social Media Manager",
    "Photographer",
    "Digital Marketing",
    "Other",
] as const;

type FormState = {
    fullName: string;
    email: string;
    phone: string;
    location: string;
    role: string;
    customRole: string;
    portfolioUrl: string;
    coverLetter: string;
};

const initialFormState: FormState = {
    fullName: "",
    email: "",
    phone: "",
    location: "",
    role: ROLE_OPTIONS[0],
    customRole: "",
    portfolioUrl: "",
    coverLetter: "",
};

function validateResumeFile(file: File | null) {
    if (!file) {
        return "Please upload your resume.";
    }

    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!ACCEPTED_RESUME_TYPES.has(file.type) && !ACCEPTED_RESUME_EXTENSIONS.has(extension)) {
        return "Please upload a PDF, DOC, or DOCX resume.";
    }

    if (file.size > MAX_RESUME_SIZE_BYTES) {
        return "Resume must be 5MB or smaller.";
    }

    return null;
}

export default function CareersApplicationForm() {
    const toast = useToast();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [form, setForm] = useState<FormState>(initialFormState);
    const [resumeFile, setResumeFile] = useState<File | null>(null);
    const [resumeError, setResumeError] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const finalRole = form.role === "Other" ? form.customRole.trim() : form.role;

    const updateField = <K extends keyof FormState,>(field: K, value: FormState[K]) => {
        setForm((current) => ({
            ...current,
            [field]: value,
        }));
    };

    const handleResumeChange = (file: File | null) => {
        setResumeFile(file);
        setResumeError(validateResumeFile(file));
    };

    const resetForm = () => {
        setForm(initialFormState);
        setResumeFile(null);
        setResumeError(null);
        setSubmitError(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSubmitError(null);

        const fileError = validateResumeFile(resumeFile);
        if (fileError) {
            setResumeError(fileError);
            toast.error("Resume required", fileError);
            return;
        }

        if (!finalRole) {
            const message = "Please choose the role you are applying for.";
            setSubmitError(message);
            toast.error("Role required", message);
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = new FormData();
            payload.append("fullName", form.fullName);
            payload.append("email", form.email);
            payload.append("phone", form.phone);
            payload.append("location", form.location);
            payload.append("role", finalRole);
            payload.append("portfolioUrl", form.portfolioUrl);
            payload.append("coverLetter", form.coverLetter);
            payload.append("resume", resumeFile as File);

            const response = await fetch("/api/careers/apply", {
                method: "POST",
                body: payload,
            });

            const body = (await response.json().catch(() => null)) as
                | { message?: string; error?: string }
                | null;

            if (!response.ok) {
                throw new Error(body?.error || "Unable to submit your application right now.");
            }

            toast.success(
                "Application submitted",
                body?.message || "Your resume has been sent to the Only Workshops team."
            );
            resetForm();
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Unable to submit your application right now.";
            setSubmitError(message);
            toast.error("Application not sent", message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                    <span className="text-sm font-inter font-semibold text-dark">Full name</span>
                    <input
                        type="text"
                        value={form.fullName}
                        onChange={(event) => updateField("fullName", event.target.value)}
                        className="interactive-field w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-inter text-dark outline-none"
                        placeholder="Your full name"
                        autoComplete="name"
                        required
                    />
                </label>

                <label className="space-y-2">
                    <span className="text-sm font-inter font-semibold text-dark">Email</span>
                    <input
                        type="email"
                        value={form.email}
                        onChange={(event) => updateField("email", event.target.value)}
                        className="interactive-field w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-inter text-dark outline-none"
                        placeholder="you@example.com"
                        autoComplete="email"
                        required
                    />
                </label>

                <label className="space-y-2">
                    <span className="text-sm font-inter font-semibold text-dark">Phone</span>
                    <input
                        type="tel"
                        value={form.phone}
                        onChange={(event) => updateField("phone", event.target.value)}
                        className="interactive-field w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-inter text-dark outline-none"
                        placeholder="+91 98765 43210"
                        autoComplete="tel"
                        required
                    />
                </label>

                <label className="space-y-2">
                    <span className="text-sm font-inter font-semibold text-dark">
                        Current location
                    </span>
                    <input
                        type="text"
                        value={form.location}
                        onChange={(event) => updateField("location", event.target.value)}
                        className="interactive-field w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-inter text-dark outline-none"
                        placeholder="City"
                        autoComplete="address-level2"
                        required
                    />
                </label>

                <label className="space-y-2">
                    <span className="text-sm font-inter font-semibold text-dark">
                        Role you are applying for
                    </span>
                    <select
                        value={form.role}
                        onChange={(event) => updateField("role", event.target.value)}
                        className="interactive-field w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-inter text-dark outline-none"
                        required
                    >
                        {ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>
                                {role}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="space-y-2">
                    <span className="text-sm font-inter font-semibold text-dark">
                        LinkedIn or portfolio
                    </span>
                    <input
                        type="url"
                        value={form.portfolioUrl}
                        onChange={(event) => updateField("portfolioUrl", event.target.value)}
                        className="interactive-field w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-inter text-dark outline-none"
                        placeholder="https://linkedin.com/in/your-name"
                    />
                </label>
            </div>

            {form.role === "Other" && (
                <label className="space-y-2 block">
                    <span className="text-sm font-inter font-semibold text-dark">
                        Tell us your role
                    </span>
                    <input
                        type="text"
                        value={form.customRole}
                        onChange={(event) => updateField("customRole", event.target.value)}
                        className="interactive-field w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-inter text-dark outline-none"
                        placeholder="Your role"
                        required
                    />
                </label>
            )}

            <label className="space-y-2 block">
                <span className="text-sm font-inter font-semibold text-dark">
                    Why do you want to work with us?
                </span>
                <textarea
                    value={form.coverLetter}
                    onChange={(event) => updateField("coverLetter", event.target.value)}
                    className="interactive-field min-h-36 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-inter text-dark outline-none"
                    placeholder="Tell us about your background, your strengths, and why you want to join Only Workshops."
                    required
                />
            </label>

            <label className="block">
                <span className="mb-2 block text-sm font-inter font-semibold text-dark">
                    Resume
                </span>
                <div className="rounded-2xl border border-dashed border-terracotta/40 bg-terracotta/5 p-4">
                    <div className="flex items-start gap-3">
                        <div className="mt-0.5 rounded-2xl bg-white p-2 text-terracotta shadow-soft">
                            <UploadCloud className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,.doc,.docx"
                                onChange={(event) =>
                                    handleResumeChange(event.target.files?.[0] || null)
                                }
                                className="block w-full text-sm font-inter text-dark file:mr-3 file:rounded-full file:border-0 file:bg-terracotta file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-terracotta-600"
                                required
                            />
                            <p className="mt-2 text-xs font-inter text-dark-muted">
                                PDF, DOC, or DOCX. Maximum 5MB.
                            </p>
                            {resumeFile ? (
                                <p className="mt-2 truncate text-sm font-inter font-medium text-dark">
                                    Selected: {resumeFile.name}
                                </p>
                            ) : null}
                            {resumeError ? (
                                <p className="mt-2 text-sm font-inter text-red-600">
                                    {resumeError}
                                </p>
                            ) : null}
                        </div>
                    </div>
                </div>
            </label>

            {submitError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-inter text-red-700">
                    {submitError}
                </div>
            ) : null}

            <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-70"
            >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isSubmitting ? "Sending application..." : "Send application"}
            </button>
        </form>
    );
}
