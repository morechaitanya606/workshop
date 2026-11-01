import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminUser, jsonError } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import { handleApiError, parseBody } from "@/lib/api-route";
import { offerSettingsFor, type CouponOffersSetting } from "@/lib/offers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { couponUpdateSchema } from "@/lib/validators";
import {
    applyDisplayInput,
    checkCouponOffers,
    displayToAdmin,
    failureResponse,
    hasDisplayInput,
    OFFER_SETTINGS_READ_FAILED,
    pickDisplayInput,
    readCouponOffersFresh,
    revalidateCouponOffers,
    withoutCoupon,
    writeCouponOffers,
    type CouponOffersRead,
} from "../coupon-offers-store";

const couponIdSchema = z.string().uuid();

const COLUMN_FIELDS = [
    "discount_type",
    "discount_value",
    "min_order_amount",
    "max_uses",
    "valid_from",
    "valid_until",
    "applicable_categories",
    "applicable_workshop_ids",
    "is_active",
] as const;

/**
 * Updates a coupon's rules (columns) and/or how it is shown (the "coupon_offers" setting).
 * Display changes are checked first (fresh read, validation, label-code check) so a refused
 * label writes nothing at all; the row is updated next and the setting last. If only that last
 * write fails, the answer is 200 with a `warning` (the row did change).
 */
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
        const display = pickDisplayInput(input);
        const changesDisplay = hasDisplayInput(display);
        const changesColumns = COLUMN_FIELDS.some((field) => input[field] !== undefined);

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

        let setting: CouponOffersSetting = {};
        let offersRead: Extract<CouponOffersRead, { ok: true }> | null = null;
        let stored: Awaited<ReturnType<typeof checkCouponOffers>> | null = null;
        if (changesDisplay) {
            const read = await readCouponOffersFresh(service.client);
            if (!read.ok) return failureResponse(OFFER_SETTINGS_READ_FAILED);
            offersRead = read;
            setting = applyDisplayInput(read.setting, id, display);
            stored = await checkCouponOffers(service.client, setting, id);
            if (!stored.ok) return failureResponse(stored);
        }

        let row: Record<string, unknown> | null = null;
        if (changesColumns) {
            const { data, error } = await service.client
                .from("coupons")
                .update({
                    ...(input.discount_type !== undefined && {
                        discount_type: input.discount_type,
                    }),
                    ...(input.discount_value !== undefined && {
                        discount_value: input.discount_value,
                    }),
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
            row = data;
        } else {
            // Display only: the coupon must exist before its entry is written.
            const { data, error } = await service.client
                .from("coupons")
                .select("*")
                .eq("id", id)
                .maybeSingle();
            if (error) {
                throw error;
            }
            row = data;
        }
        if (!row) {
            return jsonError("Coupon not found.", 404);
        }

        let warning: string | undefined;
        let displaySetting = setting;
        if (stored?.ok && offersRead) {
            const written = await writeCouponOffers(service.client, {
                setting,
                stored: stored.stored,
                version: offersRead.version,
                rebuild: (current) => applyDisplayInput(current, id, display),
                couponId: id,
            });
            if (written.ok) {
                displaySetting = written.setting;
            } else {
                warning = `The coupon's rules were saved, but its offer settings were not: ${written.error}`;
                // Answer with what is stored: the entry as it was before this request.
                const reread = await readCouponOffersFresh(service.client);
                displaySetting = reread.ok ? reread.setting : {};
            }
        } else if (!changesDisplay) {
            const read = await readCouponOffersFresh(service.client);
            displaySetting = read.ok ? read.setting : {};
        }

        revalidateCouponOffers();

        return NextResponse.json(
            {
                coupon: { ...row, ...displayToAdmin(offerSettingsFor(displaySetting, id)) },
                ...(warning ? { warning } : {}),
            },
            { status: 200 }
        );
    } catch (error) {
        return handleApiError("Failed to update coupon.", error);
    }
}

/**
 * Deletes a coupon for good. Past bookings are unaffected: coupon_redemptions.coupon_id is
 * ON DELETE SET NULL (migration 20261001100600), so each redemption keeps its discount amount as
 * an audit record. A shopper still holding the code at checkout gets the usual "not valid" error.
 * Its "coupon_offers" entry is removed too; if that fails the entry is harmless (no coupon row
 * matches it any more) and the answer carries a `warning`.
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const limited = await enforceRateLimit(request, "write", "api-coupons-delete");
    if (!limited.ok) return limited.response;

    const { id } = await params;
    const auth = await requireAdminUser(request);
    if (!auth.ok) return auth.response;

    if (!couponIdSchema.safeParse(id).success) {
        return jsonError("Invalid coupon id.", 400);
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;

    try {
        const { data, error } = await service.client
            .from("coupons")
            .delete()
            .eq("id", id)
            .select("id")
            .maybeSingle();

        if (error) {
            throw error;
        }
        if (!data) {
            return jsonError("Coupon not found.", 404);
        }

        let warning: string | undefined;
        const read = await readCouponOffersFresh(service.client);
        if (!read.ok) {
            warning = "The coupon was deleted, but its offer settings could not be tidied up.";
        } else if (offerSettingsFor(read.setting, id)) {
            const next = withoutCoupon(read.setting, id);
            const checked = await checkCouponOffers(service.client, next);
            const written = checked.ok
                ? await writeCouponOffers(service.client, {
                      setting: next,
                      stored: checked.stored,
                      version: read.version,
                      rebuild: (current) => withoutCoupon(current, id),
                  })
                : checked;
            if (!written.ok) {
                warning = "The coupon was deleted, but its offer settings could not be tidied up.";
            }
        }

        revalidateCouponOffers();

        return NextResponse.json(
            { ok: true, id: data.id, ...(warning ? { warning } : {}) },
            { status: 200 }
        );
    } catch (error) {
        return handleApiError("Failed to delete coupon.", error);
    }
}
