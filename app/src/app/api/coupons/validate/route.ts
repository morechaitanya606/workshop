import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAnonServerClient } from "@/lib/supabase-server";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import * as Sentry from "@sentry/nextjs";

export async function POST(request: NextRequest) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    try {
        const body = await request.json();
        const { code, workshopId, subtotal } = body;

        if (!code) {
            return NextResponse.json(
                { valid: false, message: "Coupon code is required" },
                { status: 400 }
            );
        }

        const supabase = createSupabaseAnonServerClient();

        // Check if coupon exists and is valid
        const { data: coupon, error } = await supabase
            .from("coupons")
            .select("*")
            .eq("code", code.toUpperCase())
            .single();

        if (error || !coupon) {
            return NextResponse.json(
                { valid: false, message: "Invalid or nonexistent coupon code." },
                { status: 400 }
            );
        }

        if (!coupon.is_active) {
            return NextResponse.json(
                { valid: false, message: "This coupon is no longer active." },
                { status: 400 }
            );
        }

        const now = new Date();
        if (coupon.valid_from && new Date(coupon.valid_from) > now) {
            return NextResponse.json(
                { valid: false, message: "This coupon is not yet valid." },
                { status: 400 }
            );
        }

        if (coupon.valid_until && new Date(coupon.valid_until) < now) {
            return NextResponse.json(
                { valid: false, message: "This coupon has expired." },
                { status: 400 }
            );
        }

        if (coupon.max_uses !== null && (coupon.used_count || 0) >= coupon.max_uses) {
            return NextResponse.json(
                { valid: false, message: "This coupon has reached its maximum uses." },
                { status: 400 }
            );
        }

        if (coupon.min_order_amount && subtotal && subtotal < coupon.min_order_amount) {
            return NextResponse.json(
                {
                    valid: false,
                    message: `Minimum order amount of ₹${coupon.min_order_amount} required.`,
                },
                { status: 400 }
            );
        }

        // Workshop specific validation
        if (coupon.applicable_workshop_ids && coupon.applicable_workshop_ids.length > 0) {
            if (!workshopId || !coupon.applicable_workshop_ids.includes(workshopId)) {
                return NextResponse.json(
                    { valid: false, message: "This coupon is not valid for this workshop." },
                    { status: 400 }
                );
            }
        }

        return NextResponse.json(
            {
                valid: true,
                discount: coupon.discount_value,
                type: coupon.discount_type,
                message: "Coupon applied successfully!",
                id: coupon.id,
            },
            { status: 200 }
        );
    } catch (error) {
        Sentry.captureException(error, {
            tags: { layer: "api", route: "coupons_validate" },
        });
        return NextResponse.json(
            { valid: false, message: "Internal server error." },
            { status: 500 }
        );
    }
}
