import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { requireAdminUser } from "@/lib/api-auth";
import { workshopCreateSchema } from "@/lib/validators";
import {
    buildWorkshopInsertPayload,
    mapWorkshopRowToWorkshop,
} from "@/lib/workshop-utils";

export async function GET(request: NextRequest) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    if (!isSupabaseServiceConfigured) {
        return NextResponse.json(
            {
                error:
                    "Supabase service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY.",
            },
            { status: 500 }
        );
    }

    try {
        const serviceClient = createSupabaseServiceClient();
        const { data, error } = await serviceClient
            .from("workshops")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(100);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            data: (data || []).map((row) =>
                mapWorkshopRowToWorkshop(row as Record<string, unknown>)
            ),
        });
    } catch (error) {
        return NextResponse.json(
            {
                error: "Failed to load admin workshops.",
                details: String(error),
            },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) {
        return auth.response;
    }

    if (!isSupabaseServiceConfigured) {
        return NextResponse.json(
            {
                error:
                    "Supabase service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY.",
            },
            { status: 500 }
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const parsed = workshopCreateSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            {
                error: "Workshop form validation failed.",
                details: parsed.error.flatten(),
            },
            { status: 400 }
        );
    }

    try {
        const serviceClient = createSupabaseServiceClient();
        const payload = buildWorkshopInsertPayload(parsed.data, auth.user.id);
        const { data, error } = await serviceClient
            .from("workshops")
            .insert(payload)
            .select("*")
            .single();

        if (error) {
            return NextResponse.json(
                {
                    error:
                        "Unable to create workshop. Confirm the Supabase migration was applied.",
                    details: error.message,
                },
                { status: 500 }
            );
        }

        return NextResponse.json(
            {
                workshop: mapWorkshopRowToWorkshop(
                    data as Record<string, unknown>
                ),
            },
            { status: 201 }
        );
    } catch (error) {
        return NextResponse.json(
            {
                error: "Failed to publish workshop.",
                details: String(error),
            },
            { status: 500 }
        );
    }
}
