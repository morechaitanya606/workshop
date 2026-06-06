import type { SupabaseServerClient } from "@/lib/supabase-server";

type WorkshopOwnerLookup = {
    exists: boolean;
    ownerUserId: string | null;
};

export type ConfirmedWorkshopAttendee = {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    guests: number;
    status: string;
    attended: boolean;
    created_at: string;
};

function getErrorMessage(error: unknown) {
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && "message" in error) {
        return String((error as { message?: unknown }).message || "");
    }
    return "";
}

function isMissingColumnError(error: unknown, columnName: string) {
    const message = getErrorMessage(error).toLowerCase();
    const column = columnName.toLowerCase();

    return (
        message.includes(column) &&
        (message.includes("column") ||
            message.includes("schema cache") ||
            message.includes("does not exist"))
    );
}

export async function getWorkshopOwnerLookup(
    serviceClient: SupabaseServerClient,
    workshopId: string
): Promise<WorkshopOwnerLookup> {
    const primaryQuery = await serviceClient
        .from("workshops")
        .select("id, host_user_id, host_id")
        .eq("id", workshopId)
        .maybeSingle();

    if (primaryQuery.error) {
        if (!isMissingColumnError(primaryQuery.error, "host_user_id")) {
            throw primaryQuery.error;
        }

        const fallbackQuery = await serviceClient
            .from("workshops")
            .select("id, host_id")
            .eq("id", workshopId)
            .maybeSingle();

        if (fallbackQuery.error) {
            throw fallbackQuery.error;
        }

        if (!fallbackQuery.data) {
            return {
                exists: false,
                ownerUserId: null,
            };
        }

        if (!fallbackQuery.data.host_id) {
            return {
                exists: true,
                ownerUserId: null,
            };
        }

        const hostQuery = await serviceClient
            .from("hosts")
            .select("user_id")
            .eq("id", fallbackQuery.data.host_id)
            .maybeSingle();

        if (hostQuery.error) {
            throw hostQuery.error;
        }

        return {
            exists: true,
            ownerUserId: hostQuery.data?.user_id ?? null,
        };
    }

    if (!primaryQuery.data) {
        return {
            exists: false,
            ownerUserId: null,
        };
    }

    if (primaryQuery.data.host_user_id) {
        return {
            exists: true,
            ownerUserId: primaryQuery.data.host_user_id,
        };
    }

    if (!primaryQuery.data.host_id) {
        return {
            exists: true,
            ownerUserId: null,
        };
    }

    const hostQuery = await serviceClient
        .from("hosts")
        .select("user_id")
        .eq("id", primaryQuery.data.host_id)
        .maybeSingle();

    if (hostQuery.error) {
        throw hostQuery.error;
    }

    return {
        exists: true,
        ownerUserId: hostQuery.data?.user_id ?? null,
    };
}

export async function getConfirmedWorkshopAttendees(
    serviceClient: SupabaseServerClient,
    workshopId: string
): Promise<ConfirmedWorkshopAttendee[]> {
    const primaryQuery = await serviceClient
        .from("bookings")
        .select("id, first_name, last_name, email, phone, guests, status, attended, created_at")
        .eq("workshop_id", workshopId)
        .eq("status", "confirmed")
        .order("created_at", { ascending: true });

    if (!primaryQuery.error) {
        return (Array.isArray(primaryQuery.data) ? primaryQuery.data : []).map((booking) => ({
            id: booking.id,
            first_name: booking.first_name,
            last_name: booking.last_name,
            email: booking.email,
            phone: booking.phone,
            guests: booking.guests,
            status: booking.status,
            attended: Boolean(booking.attended),
            created_at: booking.created_at,
        }));
    }

    if (!isMissingColumnError(primaryQuery.error, "attended")) {
        throw primaryQuery.error;
    }

    const fallbackQuery = await serviceClient
        .from("bookings")
        .select("id, first_name, last_name, email, phone, guests, status, created_at")
        .eq("workshop_id", workshopId)
        .eq("status", "confirmed")
        .order("created_at", { ascending: true });

    if (fallbackQuery.error) {
        throw fallbackQuery.error;
    }

    return (Array.isArray(fallbackQuery.data) ? fallbackQuery.data : []).map((booking) => ({
        id: booking.id,
        first_name: booking.first_name,
        last_name: booking.last_name,
        email: booking.email,
        phone: booking.phone,
        guests: booking.guests,
        status: booking.status,
        attended: false,
        created_at: booking.created_at,
    }));
}
