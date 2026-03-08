import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError, parseQuery } from "@/lib/api-route";
import type { DbTable } from "@/lib/database.types";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { requireAdminUser } from "@/lib/api-auth";
import { adminRegistrationsQuerySchema } from "@/lib/validators";

const BOOKING_STATUSES: DbTable<"bookings">["status"][] = ["confirmed", "cancelled", "refunded"];

export async function GET(request: NextRequest) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    if (!isSupabaseServiceConfigured) {
        return NextResponse.json(
            { error: "Supabase service role is not configured." },
            { status: 500 }
        );
    }

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

        const serviceClient = createSupabaseServiceClient();
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
            BOOKING_STATUSES.includes(status as DbTable<"bookings">["status"])
        ) {
            query = query.eq("status", status as DbTable<"bookings">["status"]);
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
            return NextResponse.json(
                { error: "Failed to load registrations.", details: error.message },
                { status: 500 }
            );
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
