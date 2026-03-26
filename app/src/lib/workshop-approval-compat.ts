export type WorkshopApprovalStatus = "pending" | "approved" | "rejected";

function getErrorMessage(error: unknown) {
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && "message" in error) {
        return String((error as { message?: unknown }).message || "");
    }
    return "";
}

export function isMissingApprovalStatusColumnError(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();

    return (
        message.includes("approval_status") &&
        (message.includes("schema cache") ||
            (message.includes("column") && message.includes("does not exist")) ||
            (message.includes("could not find") && message.includes("column")) ||
            (message.includes("relation") && message.includes("does not exist")))
    );
}

export function getWorkshopApprovalStatus(value: unknown): WorkshopApprovalStatus {
    return value === "pending" || value === "rejected" || value === "approved"
        ? value
        : "approved";
}

export function withoutApprovalStatus<T extends Record<string, unknown>>(
    value: T
): Omit<T, "approval_status"> {
    const { approval_status: _approvalStatus, ...rest } = value;
    return rest;
}
