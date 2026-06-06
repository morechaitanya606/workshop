export function isMissingFeedbackTableError(error: unknown) {
    if (!error || typeof error !== "object") {
        return false;
    }

    const code = String((error as { code?: string }).code || "").toUpperCase();
    const message = String((error as { message?: string }).message || "").toLowerCase();

    return (
        code === "42P01" ||
        code === "PGRST205" ||
        message.includes("public.workshop_feedback") ||
        message.includes("workshop_feedback")
    );
}
