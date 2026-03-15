import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { z } from "zod";

const waitlistSchema = z.object({
    email: z.string().email("Invalid email address"),
    userId: z.string().optional(),
});

type Params = {
    params: { id: string };
};

export async function POST(request: NextRequest, { params }: Params) {
    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    try {
        const body = await request.json();
        const parsed = waitlistSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: "Invalid email address", success: false },
                { status: 400 }
            );
        }

        const email = parsed.data.email;
        const userId = parsed.data.userId;

        const { data: workshop, error: fetchError } = await serviceClient
            .from("workshops")
            .select("id")
            .eq("id", params.id)
            .maybeSingle();

        if (fetchError || !workshop) {
            return NextResponse.json({ error: "Workshop not found", success: false }, { status: 404 });
        }

        const { data: existing } = await serviceClient
            .from("waitlists")
            .select("id")
            .eq("workshop_id", params.id)
            .eq("email", email)
            .maybeSingle();

        if (existing) {
             return NextResponse.json({ success: true, message: "Already on waitlist." });
        }

        const { error: insertError } = await serviceClient
            .from("waitlists")
            .insert({
                workshop_id: params.id,
                email,
                user_id: userId || null,
            } as any);

        if (insertError) throw insertError;

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError("Failed to join waitlist.", error);
    }
}
