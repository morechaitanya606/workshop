import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { requireAdminUser } from "@/lib/api-auth";

const checkInSchema = z.object({
    attended: z.boolean(),
});

type Params = {
    params: { id: string };
};

function getErrorMessage(error: unknown) {
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && "message" in error) {
        return String((error as { message?: unknown }).message || "");
    }
    return "";
}

function isMissingAttendedColumnError(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    return (
        message.includes("attended") &&
        (message.includes("column") ||
            message.includes("schema cache") ||
            message.includes("does not exist"))
    );
}

export async function PATCH(request: NextRequest, { params }: Params) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    try {
        const body = await request.json();
        const parsed = checkInSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: "Invalid boolean for attended status", success: false },
                { status: 400 }
            );
        }

        const { attended } = parsed.data;

        const { data: booking, error: fetchError } = await serviceClient
            .from("bookings")
            .select("id")
            .eq("id", params.id)
            .maybeSingle();

        if (fetchError || !booking) {
            return NextResponse.json(
                { error: "Booking not found", success: false },
                { status: 404 }
            );
        }

        const { error: updateError } = await serviceClient
            .from("bookings")
            .update({ attended } as any)
            .eq("id", params.id);

        if (updateError) {
            if (isMissingAttendedColumnError(updateError)) {
                return NextResponse.json(
                    {
                        error: "Check-in is not available until the attended column is added.",
                        success: false,
                    },
                    { status: 400 }
                );
            }
            throw updateError;
        }

        return NextResponse.json({ success: true, attended });
    } catch (error) {
        return handleApiError("Failed to update check-in status.", error);
    }
}
