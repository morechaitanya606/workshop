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

async function ensureHostProfileAndRecord(
    service: ReturnType<typeof requireSupabaseService>,
    userId: string,
    application: {
        name: string;
        bio: string;
        portfolio_url: string | null;
    }
) {
    if (!service.ok) {
        return;
    }

    const client = service.client;

    const { error: profileError } = await client
        .from("profiles")
        .update({ role: "host" })
        .eq("id", userId);

    if (profileError) {
        throw profileError;
    }

    const { data: existingHost, error: existingHostError } = await client
        .from("hosts")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

    if (existingHostError) {
        throw existingHostError;
    }

    if (existingHost?.id) {
        const { error: hostUpdateError } = await client
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
        const { error: hostInsertError } = await client.from("hosts").insert({
            user_id: userId,
            name: application.name,
            bio: application.bio,
            social_links: application.portfolio_url ? { website: application.portfolio_url } : {},
        });

        if (hostInsertError) {
            throw hostInsertError;
        }
    }
}

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
            status: "approved" as const,
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

            await ensureHostProfileAndRecord(service, auth.user.id, {
                name: data.name,
                bio: data.bio,
                portfolio_url: data.portfolio_url,
            });

            return NextResponse.json({
                application: data,
                message: "You are now approved as a host.",
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

        await ensureHostProfileAndRecord(service, auth.user.id, {
            name: data.name,
            bio: data.bio,
            portfolio_url: data.portfolio_url,
        });

        return NextResponse.json(
            { application: data, message: "You are now approved as a host." },
            { status: 201 }
        );
    } catch (error) {
        return handleApiError("Failed to submit host application.", error);
    }
}
