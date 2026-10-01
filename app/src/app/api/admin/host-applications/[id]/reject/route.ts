import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/api-auth";
import { handleApiError } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";

type Params = {
    params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
    const { id } = await params;

    // Address-keyed limit before the remote auth lookup, so a flood of junk tokens does not
    // buy one Supabase Auth call each.
    const preAuthLimit = await assertRateLimit({
        key: getRateLimitKey(request, "admin-host-application-reject-ip"),
        limit: 120,
        windowMs: 60_000,
        message: "Too many rejection actions. Please wait and retry.",
    });
    if (!preAuthLimit.ok) {
        return preAuthLimit.response;
    }

    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const rateLimitResult = await assertRateLimit({
        key: getRateLimitKey(request, "admin-host-application-reject", auth.user.id),
        limit: 30,
        windowMs: 60_000,
        message: "Too many rejection actions. Please wait and retry.",
    });
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }

    try {
        const { data: existing, error: existingError } = await service.client
            .from("host_applications")
            .select("id, user_id, status")
            .eq("id", id)
            .maybeSingle();

        if (existingError) {
            throw existingError;
        }
        if (!existing) {
            return NextResponse.json({ error: "Host application not found." }, { status: 404 });
        }

        const { data: application, error } = await service.client
            .from("host_applications")
            .update({ status: "rejected" })
            .eq("id", id)
            .select("*")
            .maybeSingle();

        if (error) {
            throw error;
        }
        if (!application) {
            return NextResponse.json({ error: "Host application not found." }, { status: 404 });
        }

        // Rejecting an application that was already approved must take the host role back,
        // otherwise the status says "rejected" while the account keeps host powers. Only
        // `role = 'host'` is touched: an admin is never demoted. The hosts row and the host's
        // workshops are deliberately left alone -- this is not a deactivation.
        let roleRevoked = false;
        if (existing.status === "approved" && existing.user_id) {
            const { data: revoked, error: revokeError } = await service.client
                .from("profiles")
                .update({ role: "user" })
                .eq("id", existing.user_id)
                .eq("role", "host")
                .select("id");

            if (revokeError) {
                throw revokeError;
            }
            roleRevoked = Array.isArray(revoked) && revoked.length > 0;
        }

        return NextResponse.json({
            success: true,
            application,
            roleRevoked,
            message: "Host application rejected.",
        });
    } catch (error) {
        return handleApiError("Failed to reject host application.", error);
    }
}
