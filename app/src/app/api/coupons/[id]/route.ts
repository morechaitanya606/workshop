import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminUser, jsonError } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { handleApiError, parseBody } from "@/lib/api-route";
import { enforceRateLimit } from "@/lib/rate-limit";
import { couponUpdateSchema } from "@/lib/validators";

const couponIdSchema = z.string().uuid();

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const limited = await enforceRateLimit(request, "write", "api-coupons-update");
    if (!limited.ok) return limited.response;

    const { id } = await params;
    const auth = await requireAdminUser(request);
    if (!auth.ok) return auth.response;

    if (!couponIdSchema.safeParse(id).success) {
        return jsonError("Invalid coupon id.", 400);
    }

    const parsed = await parseBody(
        request,
        couponUpdateSchema,
        "Invalid JSON payload.",
        "Invalid coupon payload."
    );
    if (!parsed.ok) return parsed.response;

    const service = requireSupabaseService();
    if (!service.ok) return service.response;

    try {
        const input = parsed.data;

        // A partial update cannot see the stored discount_type, so the "percentage <= 100"
        // rule has to be checked against the merged result.
        if (input.discount_type !== undefined || input.discount_value !== undefined) {
            const { data: current, error: currentError } = await service.client
                .from("coupons")
                .select("discount_type, discount_value")
                .eq("id", id)
                .maybeSingle();

            if (currentError) {
                throw currentError;
            }
            if (!current) {
                return jsonError("Coupon not found.", 404);
            }

            const effectiveType = input.discount_type ?? current.discount_type;
            const effectiveValue = input.discount_value ?? Number(current.discount_value);
            if (effectiveType === "percentage" && effectiveValue > 100) {
                return jsonError("A percentage discount cannot exceed 100.", 400);
            }
        }

        const { data, error } = await service.client
            .from("coupons")
            .update({
                ...(input.discount_type !== undefined && { discount_type: input.discount_type }),
                ...(input.discount_value !== undefined && { discount_value: input.discount_value }),
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
                updated_at: new Date().toISOString(),
            })
            .eq("id", id)
            .select()
            .maybeSingle();

        if (error) {
            throw error;
        }
        if (!data) {
            return jsonError("Coupon not found.", 404);
        }

        return NextResponse.json({ coupon: data }, { status: 200 });
    } catch (error) {
        return handleApiError("Failed to update coupon.", error);
    }
}
