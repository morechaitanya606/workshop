import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdminUser, requireAuthenticatedUser } from "@/lib/api-auth";
import { handleApiError, parseBody, parseQuery } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { cursorPageQuerySchema, hostApplicationSchema, toPageCursor } from "@/lib/validators";

export async function GET(request: NextRequest) {
    // Address-keyed limit before the remote auth lookup (requireAdminUser calls Supabase).
    const preAuthLimit = await assertRateLimit({
        key: getRateLimitKey(request, "admin-host-applications-read-ip"),
        limit: 240,
        windowMs: 60_000,
        message: "Too many application dashboard refreshes. Please wait and retry.",
    });
    if (!preAuthLimit.ok) {
        return preAuthLimit.response;
    }

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

    const parsedQuery = parseQuery(
        request,
        cursorPageQuerySchema,
        "Invalid host applications query."
    );
    if (!parsedQuery.ok) {
        return parsedQuery.response;
    }
    const { limit, cursor } = parsedQuery.data;

    const service = requireSupabaseService();
    if (!service.ok) {
        return service.response;
    }

    try {
        let query = service.client
            .from("host_applications")
            .select("*")
            .order("created_at", { ascending: false })
            // One extra row tells us whether another page exists without a count query.
            .limit(limit + 1);

        if (cursor) {
            query = query.lt("created_at", cursor);
        }

        const { data, error } = await query;

        if (error) {
            throw error;
        }

        const rows = data || [];
        const applications = rows.slice(0, limit);
        const nextCursor =
            rows.length > limit
                ? toPageCursor(applications[applications.length - 1]?.created_at)
                : null;

        return NextResponse.json({ applications, nextCursor });
    } catch (error) {
        return handleApiError("Failed to load host applications.", error);
    }
}

export async function POST(request: NextRequest) {
    const preAuthLimit = await assertRateLimit({
        key: getRateLimitKey(request, "host-application-write-ip"),
        limit: 40,
        windowMs: 60_000,
        message: "Too many application attempts. Please wait and retry.",
    });
    if (!preAuthLimit.ok) {
        return preAuthLimit.response;
    }

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
            details: parsed.data.details,
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
