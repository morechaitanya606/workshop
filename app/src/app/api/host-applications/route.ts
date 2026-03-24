import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser, requireAuthenticatedUser } from "@/lib/api-auth";
import { handleApiError, parseBody } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";

const hostApplicationSchema = z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email(),
    bio: z.string().trim().min(20).max(4000),
    portfolioUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
    applicationType: z.enum(["creator", "space"]).default("creator"),
    details: z.any().default({}),
});

export async function GET(request: NextRequest) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const rateLimitResult = await assertRateLimit({
        key: getRateLimitKey(request, "admin-host-applications-read", auth.user.id),
        limit: 120,
        windowMs: 60_000,
        message: "Too many application dashboard refreshes. Please wait and retry.",
    });
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }

    try {
        const { data, error } = await service.client
            .from("host_applications")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) {
            throw error;
        }

        return NextResponse.json({ applications: data || [] });
    } catch (error) {
        return handleApiError("Failed to load host applications.", error);
    }
}

export async function POST(request: NextRequest) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    const rateLimitResult = await assertRateLimit({
        key: getRateLimitKey(request, "host-application-write", auth.user.id),
        limit: 8,
        windowMs: 60_000,
        message: "Too many application attempts. Please wait and retry.",
    });
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    const parsed = await parseBody(
        request,
        hostApplicationSchema,
        "Invalid JSON payload.",
        "Invalid host application payload."
    );
    if (!parsed.ok) {
        return parsed.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }

    try {
        const { data: existing, error: existingError } = await service.client
            .from("host_applications")
            .select("id, status")
            .eq("user_id", auth.user.id)
            .maybeSingle();

        if (existingError) {
            throw existingError;
        }

        if (existing?.status === "approved") {
            return NextResponse.json(
                { message: "Your host application is already approved." },
                { status: 200 }
            );
        }

        const payload = {
            user_id: auth.user.id,
            name: parsed.data.name,
            email: parsed.data.email,
            bio: parsed.data.bio,
            portfolio_url: parsed.data.portfolioUrl || null,
            application_type: parsed.data.applicationType,
            details: parsed.data.details as any,
            status: "pending" as const,
        };

        if (existing?.id) {
            const { data, error } = await service.client
                .from("host_applications")
                .update(payload)
                .eq("id", existing.id)
                .select("*")
                .single();

            if (error) {
                throw error;
            }

            return NextResponse.json({
                application: data,
                message:
                    existing.status === "rejected"
                        ? "Application resubmitted for admin review."
                        : "Application updated and waiting for admin review.",
            });
        }

        const { data, error } = await service.client
            .from("host_applications")
            .insert(payload)
            .select("*")
            .single();

        if (error) {
            throw error;
        }

        return NextResponse.json(
            { application: data, message: "Application submitted for admin review." },
            { status: 201 }
        );
    } catch (error) {
        return handleApiError("Failed to submit host application.", error);
    }
}
