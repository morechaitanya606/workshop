import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireAdminUser, jsonError } from "@/lib/api-auth";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) return auth.response;

    try {
        const body = await request.json();
        const { is_active } = body;

        if (is_active === undefined) {
            return jsonError("Missing 'is_active' boolean payload", 400);
        }

        const supabase = createSupabaseServiceClient();

        const { data, error } = await supabase
            .from("coupons")
            .update({ is_active, updated_at: new Date().toISOString() })
            .eq("id", params.id)
            .select()
            .single();

        if (error) {
            return jsonError(error.message, 500);
        }

        return NextResponse.json({ coupon: data }, { status: 200 });
    } catch (error) {
        return jsonError("Internal Server Error", 500);
    }
}
