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

        return NextResponse.json({
            success: true,
            application,
            message: "Host application rejected.",
        });
    } catch (error) {
        return handleApiError("Failed to reject host application.", error);
    }
}
