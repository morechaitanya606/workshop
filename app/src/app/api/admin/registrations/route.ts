import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
    createSupabaseServiceClient,
    isSupabaseServiceConfigured,
} from "@/lib/supabase-server";
import { requireAdminUser } from "@/lib/api-auth";

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
        const params = request.nextUrl.searchParams;
        const q = (params.get("q") || "").trim();
        const status = (params.get("status") || "all").trim().toLowerCase();
        const page = Math.max(1, Number.parseInt(params.get("page") || "1", 10));
        const pageSize = Math.min(
            50,
            Math.max(1, Number.parseInt(params.get("pageSize") || "12", 10))
        );
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        const serviceClient = createSupabaseServiceClient();
        let query = serviceClient
            .from("bookings")
            .select(
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
            `
                ,
                { count: "exact" }
            );

        if (status && status !== "all") {
            query = query.eq("status", status);
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
        return NextResponse.json(
            { error: "Failed to load registrations.", details: String(error) },
            { status: 500 }
        );
    }
}
