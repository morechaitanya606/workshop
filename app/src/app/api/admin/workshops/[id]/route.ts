import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
    createSupabaseServiceClient,
    isSupabaseServiceConfigured,
} from "@/lib/supabase-server";
import { requireAdminUser } from "@/lib/api-auth";
import { mapWorkshopRowToWorkshop } from "@/lib/workshop-utils";
import { workshopUpdateSchema } from "@/lib/validators";
import {
    normalizeWorkshopImageUrlInput,
    normalizeWorkshopVideoUrlInput,
} from "@/lib/workshop-media";

type Params = {
    params: { id: string };
};

export async function GET(request: NextRequest, { params }: Params) {
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
        const serviceClient = createSupabaseServiceClient();
        const { data, error } = await serviceClient
            .from("workshops")
            .select("*")
            .eq("id", params.id)
            .maybeSingle();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        if (!data) {
            return NextResponse.json(
                { error: "Workshop not found." },
                { status: 404 }
            );
        }

        return NextResponse.json({
            workshop: mapWorkshopRowToWorkshop(data as Record<string, unknown>),
        });
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to load workshop.", details: String(error) },
            { status: 500 }
        );
    }
}

export async function PATCH(request: NextRequest, { params }: Params) {
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

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const parsed = workshopUpdateSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            {
                error: "Workshop update validation failed.",
                details: parsed.error.flatten(),
            },
            { status: 400 }
        );
    }

    try {
        const serviceClient = createSupabaseServiceClient();
        const { data: existing, error: existingError } = await serviceClient
            .from("workshops")
            .select("id, max_seats, seats_remaining")
            .eq("id", params.id)
            .maybeSingle();

        if (existingError) {
            return NextResponse.json(
                { error: existingError.message },
                { status: 500 }
            );
        }
        if (!existing) {
            return NextResponse.json(
                { error: "Workshop not found." },
                { status: 404 }
            );
        }

        const input = parsed.data;
        const patch: Record<string, unknown> = {};

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

        if (typeof input.maxSeats === "number") {
            const currentMaxSeats = Number(existing.max_seats || 0);
            const currentSeatsRemaining = Number(existing.seats_remaining || 0);
            const bookedSeats = Math.max(0, currentMaxSeats - currentSeatsRemaining);

            if (input.maxSeats < bookedSeats) {
                return NextResponse.json(
                    {
                        error: `Max seats cannot be less than already booked seats (${bookedSeats}).`,
                    },
                    { status: 400 }
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
            return NextResponse.json(
                { error: "Failed to update workshop.", details: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            workshop: mapWorkshopRowToWorkshop(data as Record<string, unknown>),
        });
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to update workshop.", details: String(error) },
            { status: 500 }
        );
    }
}

export async function DELETE(request: NextRequest, { params }: Params) {
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
        const serviceClient = createSupabaseServiceClient();
        const { data, error } = await serviceClient
            .from("workshops")
            .delete()
            .eq("id", params.id)
            .select("id")
            .maybeSingle();

        if (error) {
            if (error.code === "23503") {
                return NextResponse.json(
                    {
                        error:
                            "Cannot delete workshop because bookings exist for it.",
                    },
                    { status: 409 }
                );
            }
            return NextResponse.json(
                { error: "Failed to delete workshop.", details: error.message },
                { status: 500 }
            );
        }

        if (!data) {
            return NextResponse.json(
                { error: "Workshop not found." },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to delete workshop.", details: String(error) },
            { status: 500 }
        );
    }
}
