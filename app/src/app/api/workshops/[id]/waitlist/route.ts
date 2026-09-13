import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/rate-limit";

// `userId` used to be taken from the body and written straight into waitlists.user_id on
// an unauthenticated route, so anyone could attribute a waitlist signup to any account
// and any email address. It is derived from the session now.
//
// The email follows the same rule. Leaving this route open with a caller-supplied address
// let anyone enrol arbitrary third parties -- victim@example.com, in a loop, behind an IP
// rate limit that degrades to per-instance counters whenever Upstash is unset. Nothing mails
// the waitlist today, which is the only reason that has not already become a spam cannon
// pointed at strangers from our domain. The address is the session's own from here on; the
// body field is accepted for compatibility and ignored.
const waitlistSchema = z.object({
    email: z.string().email("Invalid email address").optional(),
});

type Params = {
    params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    // Keyed on the user, not the address: an IP bucket is one shared NAT away from useless
    // and one spoofed header away from unlimited.
    const limited = await enforceRateLimit(request, "write", "api-waitlist-join", auth.user.id);
    if (!limited.ok) return limited.response;

    const email = auth.user.email?.trim().toLowerCase();
    if (!email) {
        return NextResponse.json(
            { error: "Your account has no email address to notify.", success: false },
            { status: 400 }
        );
    }

    const { id } = await params;
    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    try {
        const body = await request.json().catch(() => ({}));
        const parsed = waitlistSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: "Invalid email address", success: false },
                { status: 400 }
            );
        }

        const userId = auth.user.id;

        const { data: workshop, error: fetchError } = await serviceClient
            .from("workshops")
            .select("id")
            .eq("id", id)
            .maybeSingle();

        if (fetchError || !workshop) {
            return NextResponse.json(
                { error: "Workshop not found", success: false },
                { status: 404 }
            );
        }

        const { data: existing } = await serviceClient
            .from("waitlists")
            .select("id")
            .eq("workshop_id", id)
            .eq("email", email)
            .maybeSingle();

        if (existing) {
            return NextResponse.json({ success: true, message: "Already on waitlist." });
        }

        const { error: insertError } = await serviceClient.from("waitlists").insert({
            workshop_id: id,
            email,
            user_id: userId,
        });

        if (insertError) throw insertError;

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError("Failed to join waitlist.", error);
    }
}
