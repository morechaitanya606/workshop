import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError, parseBody } from "@/lib/api-route";
import type { TablesUpdate } from "@/lib/database.types";
import { requireSupabaseService } from "@/lib/api-helpers";
import { jsonError, requireAdminUser } from "@/lib/api-auth";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { mapWorkshopRowToWorkshop } from "@/lib/workshop-utils";
import { workshopUpdateSchema } from "@/lib/validators";
import {
    normalizeWorkshopImageUrlInput,
    normalizeWorkshopVideoUrlInput,
} from "@/lib/workshop-media";

type Params = {
    params: { id: string };
};

async function assertAdminWorkshopWriteLimit(request: NextRequest, userId: string) {
    return await assertRateLimit({
        key: getRateLimitKey(request, "admin-workshop-write", userId),
        limit: 40,
        windowMs: 60_000,
        message: "Too many workshop update requests. Please wait and try again.",
    });
}

export async function GET(request: NextRequest, { params }: Params) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    try {
        const { data, error } = await serviceClient
            .from("workshops")
            .select("*")
            .eq("id", params.id)
            .maybeSingle();

        if (error) {
            throw error;
        }
        if (!data) {
            return jsonError("Workshop not found.", 404);
        }

        return NextResponse.json({
            workshop: mapWorkshopRowToWorkshop(data),
        });
    } catch (error) {
        return handleApiError("Failed to load workshop.", error);
    }
}

export async function PATCH(request: NextRequest, { params }: Params) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const rateLimitResult = await assertAdminWorkshopWriteLimit(request, auth.user.id);
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    const parsed = await parseBody(
        request,
        workshopUpdateSchema,
        "Invalid JSON payload.",
        "Workshop update validation failed."
    );
    if (!parsed.ok) {
        return parsed.response;
    }

    try {
        const { data: existing, error: existingError } = await serviceClient
            .from("workshops")
            .select("id, max_seats, seats_remaining")
            .eq("id", params.id)
            .maybeSingle();

        if (existingError) {
            throw existingError;
        }
        if (!existing) {
            return jsonError("Workshop not found.", 404);
        }

        const input = parsed.data;
        const patch: TablesUpdate<"workshops"> = {};

        if (typeof input.title === "string") patch.title = input.title;
        if (typeof input.description === "string") patch.description = input.description;
        if (typeof input.category === "string") patch.category = input.category;
        if (typeof input.price === "number") patch.price = input.price;
        if (typeof input.location === "string") patch.location = input.location;
        if (typeof input.city === "string") patch.city = input.city;
        if (typeof input.duration === "string") patch.duration = input.duration;
        if (typeof input.date === "string") patch.date = input.date;
        if (typeof input.time === "string") patch.time = input.time;
        if (typeof input.coverImage === "string") {
            patch.cover_image = normalizeWorkshopImageUrlInput(input.coverImage);
        }
        if (Array.isArray(input.galleryImages)) {
            patch.gallery_images = input.galleryImages.map((item) =>
                normalizeWorkshopImageUrlInput(item)
            );
        }
        if (typeof input.videoUrl === "string") {
            patch.video_url = input.videoUrl
                ? normalizeWorkshopVideoUrlInput(input.videoUrl)
                : null;
        }
        if (Array.isArray(input.badgeLabels)) {
            patch.badge_labels = input.badgeLabels;
        }
        if ("eventAddress" in input) patch.event_address = input.eventAddress ?? null;
        if ("latitude" in input) patch.latitude = input.latitude ?? null;
        if ("longitude" in input) patch.longitude = input.longitude ?? null;
        if (Array.isArray(input.locationImages)) {
            patch.location_images = input.locationImages.map((item) =>
                normalizeWorkshopImageUrlInput(item)
            );
        }
        if (typeof input.earlyBirdEnabled === "boolean") {
            patch.early_bird_enabled = input.earlyBirdEnabled;
        }
        if (typeof input.earlyBirdDiscountType === "string") {
            patch.early_bird_discount_type = input.earlyBirdDiscountType;
        }
        if (typeof input.earlyBirdDiscountValue === "number") {
            patch.early_bird_discount_value = input.earlyBirdDiscountValue;
        }
        if (typeof input.earlyBirdDaysAfterListing === "number") {
            patch.early_bird_days_after_listing = input.earlyBirdDaysAfterListing;
        }

        if (typeof input.maxSeats === "number") {
            const currentMaxSeats = Number(existing.max_seats || 0);
            const currentSeatsRemaining = Number(existing.seats_remaining || 0);
            const bookedSeats = Math.max(0, currentMaxSeats - currentSeatsRemaining);

            if (input.maxSeats < bookedSeats) {
                return jsonError(
                    `Max seats cannot be less than already booked seats (${bookedSeats}).`,
                    400
                );
            }

            patch.max_seats = input.maxSeats;
            patch.seats_remaining = input.maxSeats - bookedSeats;
        }

        const { data, error } = await serviceClient
            .from("workshops")
            .update(patch)
            .eq("id", params.id)
            .select("*")
            .single();

        if (error) {
            throw error;
        }

        return NextResponse.json({
            workshop: mapWorkshopRowToWorkshop(data),
        });
    } catch (error) {
        return handleApiError("Failed to update workshop.", error);
    }
}

export async function DELETE(request: NextRequest, { params }: Params) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const rateLimitResult = await assertAdminWorkshopWriteLimit(request, auth.user.id);
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    try {
        const { data, error } = await serviceClient
            .from("workshops")
            .delete()
            .eq("id", params.id)
            .select("id")
            .maybeSingle();

        if (error) {
            if (error.code === "23503") {
                return jsonError("Cannot delete workshop because bookings exist for it.", 409);
            }
            throw error;
        }

        if (!data) {
            return jsonError("Workshop not found.", 404);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError("Failed to delete workshop.", error);
    }
}
