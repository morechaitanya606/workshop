import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireAdminUser, jsonError } from "@/lib/api-auth";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
    const limited = await enforceRateLimit(request, "publicRead", "api-coupons-list");
    if (!limited.ok) return limited.response;

    const auth = await requireAdminUser(request);
    if (!auth.ok) return auth.response;

    try {
        const supabase = createSupabaseServiceClient();
        const { data, error } = await supabase
            .from("coupons")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) {
            return jsonError(error.message, 500);
        }

        return NextResponse.json({ coupons: data }, { status: 200 });
    } catch {
        return jsonError("Internal Server Error", 500);
    }
}

export async function POST(request: NextRequest) {
    const limited = await enforceRateLimit(request, "write", "api-coupons-create");
    if (!limited.ok) return limited.response;

    const auth = await requireAdminUser(request);
    if (!auth.ok) return auth.response;

    try {
        const body = await request.json();
        const { code, discount_type, discount_value } = body;

        if (!code || !discount_type || discount_value === undefined) {
            return jsonError("Missing required fields", 400);
        }

        const supabase = createSupabaseServiceClient();

        const { data, error } = await supabase
            .from("coupons")
            .insert({
                code: code.toUpperCase(),
                discount_type,
                discount_value,
                created_by: auth.user.id,
            })
            .select()
            .single();

        if (error) {
            return jsonError(error.message, 500);
        }

        return NextResponse.json({ coupon: data }, { status: 201 });
    } catch {
        return jsonError("Internal Server Error", 500);
    }
}
