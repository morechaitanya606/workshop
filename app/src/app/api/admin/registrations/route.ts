import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError, parseQuery } from "@/lib/api-route";
import type { Tables } from "@/lib/database.types";
import { requireSupabaseService } from "@/lib/api-helpers";
import { jsonError, requireAdminUser } from "@/lib/api-auth";
import { adminRegistrationsQuerySchema } from "@/lib/validators";

const BOOKING_STATUSES: Tables<"bookings">["status"][] = ["confirmed", "cancelled", "refunded"];

export async function GET(request: NextRequest) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    try {
        const parsedQuery = parseQuery(
            request,
            adminRegistrationsQuerySchema,
            "Invalid registrations query."
        );
        if (!parsedQuery.ok) {
            return parsedQuery.response;
        }

        const q = parsedQuery.data.q;
        const status = parsedQuery.data.status.toLowerCase();
        const page = parsedQuery.data.page;
        const pageSize = parsedQuery.data.pageSize;
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let query = serviceClient.from("bookings").select(
            `
                id,
                user_id,
                first_name,
                last_name,
                email,
                phone,
                guests,
                total,
                status,
                created_at,
                workshop:workshops (
                    id,
                    title,
                    date,
                    time,
                    city,
                    location
                )
            `,
            { count: "exact" }
        );

        if (
            status !== "all" &&
            BOOKING_STATUSES.includes(status as Tables<"bookings">["status"])
        ) {
            query = query.eq("status", status as Tables<"bookings">["status"]);
        }

        if (q) {
            const safeQ = q.replace(/[%]/g, "");
            query = query.or(
                `first_name.ilike.%${safeQ}%,last_name.ilike.%${safeQ}%,email.ilike.%${safeQ}%`
            );
        }

        const { data, error, count } = await query
            .order("created_at", { ascending: false })
            .range(from, to);

        if (error) {
            throw error;
        }

        if (!Array.isArray(data)) {
            return jsonError("Failed to load registrations.", 500);
        }

        return NextResponse.json({
            registrations: data || [],
            total: count || 0,
            page,
            pageSize,
            totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)),
            filters: {
                q,
                status,
            },
        });
    } catch (error) {
        return handleApiError("Failed to load registrations.", error);
    }
}
