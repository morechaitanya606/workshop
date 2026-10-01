import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser, jsonError } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { handleApiError, parseBody, parseQuery } from "@/lib/api-route";
import { enforceRateLimit } from "@/lib/rate-limit";
import { couponCreateSchema, cursorPageQuerySchema, toPageCursor } from "@/lib/validators";

export async function GET(request: NextRequest) {
    const limited = await enforceRateLimit(request, "publicRead", "api-coupons-list");
    if (!limited.ok) return limited.response;

    const auth = await requireAdminUser(request);
    if (!auth.ok) return auth.response;

    const parsedQuery = parseQuery(request, cursorPageQuerySchema, "Invalid coupons query.");
    if (!parsedQuery.ok) return parsedQuery.response;
    const { limit, cursor } = parsedQuery.data;

    const service = requireSupabaseService();
    if (!service.ok) return service.response;

    try {
        let query = service.client
            .from("coupons")
            .select("*")
            .order("created_at", { ascending: false })
            // One extra row tells us whether another page exists without a count query.
            .limit(limit + 1);

        if (cursor) {
            query = query.lt("created_at", cursor);
        }

        const { data, error } = await query;

        if (error) {
            throw error;
        }

        const rows = data || [];
        const page = rows.slice(0, limit);
        const nextCursor =
            rows.length > limit ? toPageCursor(page[page.length - 1]?.created_at) : null;

        return NextResponse.json({ coupons: page, nextCursor }, { status: 200 });
    } catch (error) {
        return handleApiError("Failed to load coupons.", error);
    }
}

export async function POST(request: NextRequest) {
    const limited = await enforceRateLimit(request, "write", "api-coupons-create");
    if (!limited.ok) return limited.response;

    const auth = await requireAdminUser(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseBody(
        request,
        couponCreateSchema,
        "Invalid JSON payload.",
        "Invalid coupon payload."
    );
    if (!parsed.ok) return parsed.response;

    const service = requireSupabaseService();
    if (!service.ok) return service.response;

    try {
        const input = parsed.data;

        const { data, error } = await service.client
            .from("coupons")
            .insert({
                code: input.code,
                discount_type: input.discount_type,
                discount_value: input.discount_value,
                created_by: auth.user.id,
                // Omitted (not nulled) when absent so the column defaults still apply
                // (valid_from defaults to now()).
                ...(input.min_order_amount !== undefined && {
                    min_order_amount: input.min_order_amount,
                }),
                ...(input.max_uses !== undefined && { max_uses: input.max_uses }),
                ...(input.valid_from !== undefined && { valid_from: input.valid_from }),
                ...(input.valid_until !== undefined && { valid_until: input.valid_until }),
                ...(input.applicable_categories !== undefined && {
                    applicable_categories: input.applicable_categories,
                }),
                ...(input.applicable_workshop_ids !== undefined && {
                    applicable_workshop_ids: input.applicable_workshop_ids,
                }),
                ...(input.is_active !== undefined && { is_active: input.is_active }),
            })
            .select()
            .single();

        if (error) {
            // 23505 unique_violation on coupons.code.
            if (error.code === "23505") {
                return jsonError("A coupon with this code already exists.", 409);
            }
            throw error;
        }

        return NextResponse.json({ coupon: data }, { status: 201 });
    } catch (error) {
        return handleApiError("Failed to create coupon.", error);
    }
}
