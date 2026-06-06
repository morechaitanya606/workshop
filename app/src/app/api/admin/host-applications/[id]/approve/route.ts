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
        key: getRateLimitKey(request, "admin-host-application-approve", auth.user.id),
        limit: 30,
        windowMs: 60_000,
        message: "Too many approval actions. Please wait and retry.",
    });
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }

    try {
        const { data: application, error: applicationError } = await service.client
            .from("host_applications")
            .select("*")
            .eq("id", id)
            .maybeSingle();

        if (applicationError) {
            throw applicationError;
        }
        if (!application) {
            return NextResponse.json({ error: "Host application not found." }, { status: 404 });
        }
        if (application.status === "approved") {
            return NextResponse.json(
                { message: "Application is already approved.", application },
                { status: 200 }
            );
        }

        const { data: approvedApplication, error: approveError } = await service.client
            .from("host_applications")
            .update({ status: "approved" })
            .eq("id", id)
            .select("*")
            .single();

        if (approveError) {
            throw approveError;
        }

        const { error: profileError } = await service.client
            .from("profiles")
            .update({ role: "host" })
            .eq("id", application.user_id);

        if (profileError) {
            throw profileError;
        }

        const { data: existingHost, error: existingHostError } = await service.client
            .from("hosts")
            .select("id")
            .eq("user_id", application.user_id)
            .maybeSingle();

        if (existingHostError) {
            throw existingHostError;
        }

        if (existingHost?.id) {
            const { error: hostUpdateError } = await service.client
                .from("hosts")
                .update({
                    name: application.name,
                    bio: application.bio,
                    social_links: application.portfolio_url
                        ? { website: application.portfolio_url }
                        : {},
                })
                .eq("id", existingHost.id);

            if (hostUpdateError) {
                throw hostUpdateError;
            }
        } else {
            const { error: hostInsertError } = await service.client.from("hosts").insert({
                user_id: application.user_id,
                name: application.name,
                bio: application.bio,
                social_links: application.portfolio_url
                    ? { website: application.portfolio_url }
                    : {},
            });

            if (hostInsertError) {
                throw hostInsertError;
            }
        }

        return NextResponse.json({
            success: true,
            application: approvedApplication,
            message: "Host application approved.",
        });
    } catch (error) {
        return handleApiError("Failed to approve host application.", error);
    }
}
