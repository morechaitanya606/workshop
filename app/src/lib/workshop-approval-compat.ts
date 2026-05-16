export type WorkshopApprovalStatus = "pending" | "approved" | "rejected";

function getErrorMessage(error: unknown) {
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && "message" in error) {
        return String((error as { message?: unknown }).message || "");
    }
    return "";
}

export function isMissingColumnError(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();

    return (
        message.includes("schema cache") ||
        (message.includes("column") && message.includes("does not exist")) ||
        (message.includes("could not find") && message.includes("column")) ||
        (message.includes("relation") && message.includes("does not exist"))
    );
}

export function getWorkshopApprovalStatus(value: unknown): WorkshopApprovalStatus {
    return value === "pending" || value === "rejected" || value === "approved" ? value : "approved";
}

export function withoutNewColumns<T extends Record<string, unknown>>(value: T): any {
    const {
        approval_status,
        badge_labels,
        event_address,
        latitude,
        longitude,
        location_images,
        early_bird_enabled,
        early_bird_discount_type,
        early_bird_discount_value,
        early_bird_days_after_listing,
        ...rest
    } = value as any;
    return rest;
}
